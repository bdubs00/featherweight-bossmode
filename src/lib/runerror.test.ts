import { describe, expect, it } from 'vitest';
import { plainError, providerMessage } from './runerror';

// The error of a seat on the homelab fleet, as the run held it.
const PREFILL =
  'model: anthropic: stream claude-haiku-5-5: POST "http://ax-anthropic.fw-fleet.svc.cluster.local:8080/v1/messages?beta=true": 400 Bad Request (Request-ID: req_011CgJhPGRsjUd3vHdi7JLjE) (Workspace-ID: wrkspc_018mMkT171jg5neTmcSP7ha8) {"type":"error","error":{"type":"invalid_request_error","message":"This model does not support assistant message prefill. The conversation must end with a user message."},"request_id":"req_011CgJhPGRsjUd3vHdi7JLjE"}';

const anthropic = (status: string, type: string, message: string) =>
  `model: anthropic: stream claude-haiku-5-5: POST "https://api.anthropic.com/v1/messages": ${status} (Request-ID: req_1) {"type":"error","error":{"type":"${type}","message":"${message}"}}`;

describe('plainError', () => {
  it('says that the model refused a request that the provider answered with a 4xx, and keeps the message of the provider apart', () => {
    expect(plainError(PREFILL)).toBe('The model refused the request');
    expect(providerMessage(PREFILL)).toBe('This model does not support assistant message prefill. The conversation must end with a user message.');
  });

  it('names a busy provider, a refused key, refused access, an unknown model, a long conversation, and a failure of the provider', () => {
    expect(plainError(anthropic('429 Too Many Requests', 'rate_limit_error', 'Number of request tokens has exceeded your rate limit of 50,000 input tokens per minute.'))).toBe('The model was busy');
    expect(plainError(anthropic('529', 'overloaded_error', 'Overloaded'))).toBe('The model was busy');
    expect(plainError(anthropic('401 Unauthorized', 'authentication_error', 'invalid x-api-key'))).toBe('The model provider refused the key');
    expect(plainError(anthropic('403 Forbidden', 'permission_error', 'Your API key does not have permission.'))).toBe('The model provider refused access');
    expect(plainError(anthropic('404 Not Found', 'not_found_error', 'model: claude-nope'))).toBe('The model provider does not know this model');
    expect(plainError(anthropic('400 Bad Request', 'invalid_request_error', 'prompt is too long: 210000 tokens > 200000 maximum'))).toBe('The conversation is too long for the model');
    expect(plainError(anthropic('500 Internal Server Error', 'api_error', 'Internal server error'))).toBe('The model provider had an error');
    expect(plainError('model: openai: POST "https://api.openai.com/v1/chat/completions": 503 Service Unavailable')).toBe('The model provider had an error');
  });

  it('reads the status from the words of an error without JSON', () => {
    expect(plainError('model: request failed with status code 429')).toBe('The model was busy');
    expect(plainError('mcp: github: 401 Unauthorized')).toBe('A service refused the key');
    expect(plainError('mcp: tracker: 502 Bad Gateway')).toBe('A service had an error');
  });

  it('names a timeout of the model and of another step', () => {
    expect(plainError('model: anthropic: stream claude-haiku-5-5: context deadline exceeded')).toBe('The model did not answer in time');
    expect(plainError('tool http: Get "https://example.com/feed": net/http: request canceled (Client.Timeout exceeded while awaiting headers)')).toBe('A step did not finish in time');
  });

  it('names each limit of the budget, and keeps the number of the older words', () => {
    expect(plainError('budget exceeded: maxTurns')).toBe('Stopped at its turn limit');
    expect(plainError('budget exceeded: maxCostUSD of the run tree (this run and the runs under it used $2.10 of $2.00)')).toBe('Stopped at its cost limit');
    expect(plainError('budget exceeded: maxRepeats (the model made the same bash call 5 times in a row)')).toBe('Stopped: it kept repeating one step');
    expect(plainError('budget exceeded: deadline')).toBe('Stopped at its time limit');
    expect(plainError('budget exceeded: somethingNew')).toBe('Stopped at its budget');
    expect(plainError('The run reached its limit of 40 turns.')).toBe('Stopped at 40 turns');
  });

  it('never reads a limit inside the answer of a provider as a budget', () => {
    expect(plainError(anthropic('429 Too Many Requests', 'rate_limit_error', 'This request reached its limit of 50,000 tokens per minute.'))).toBe('The model was busy');
  });

  it('names a stop and a lost worker', () => {
    expect(plainError('canceled')).toBe('Stopped before it finished');
    expect(plainError('context canceled')).toBe('Stopped before it finished');
    expect(plainError('migrator-2 lost its run run-7: no worker of the fleet holds it')).toBe('Lost its worker');
  });

  it('falls back to the first sentence, without addresses, request ids, JSON, package names, or end mark', () => {
    expect(plainError('harness: claude code exited with status 1. See the log.')).toBe('Claude code exited with status 1');
    expect(plainError('fw: the tool front.pages_write is not allowed (request_id=abc123). Ask an owner.')).toBe('The tool front.pages_write is not allowed');
    expect(plainError('sandbox: fetch "https://example.com/x" failed {"oops":true}')).toBe('Fetch failed');
    expect(plainError('x'.repeat(140))).toHaveLength(100);
    expect(plainError('')).toBe('');
    expect(plainError(undefined)).toBe('');
    expect(plainError('{"error":{}}')).toBe('The run failed');
  });

  it('gives no provider message for an error without one', () => {
    expect(providerMessage('budget exceeded: maxTurns')).toBe('');
    expect(providerMessage('{"message":"Slow down."}')).toBe('Slow down.');
  });
});
