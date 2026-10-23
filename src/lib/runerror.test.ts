import { describe, expect, it } from 'vitest';
import { plainError } from './runerror';

const RAW =
  'model: anthropic: stream claude-haiku-5-5: POST "http://llm-proxy.fw.svc:8080/v1/messages": 400 Bad Request (Request-ID req_011CUQx8m2K7f3) ' +
  '{"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 214388 tokens > 200000 maximum"},"request_id":"req_011CUQx8m2K7f3"}';

describe('plainError', () => {
  it('shows the message of a provider that refused the request, and nothing of the address, the id, or the JSON', () => {
    expect(plainError(RAW)).toBe('Prompt is too long: 214388 tokens > 200000 maximum.');
  });

  it('words a rate limit, an overload, a failure of the provider, and a timeout', () => {
    expect(plainError('model: openai: POST "https://x/v1": 429 Too Many Requests {"error":{"message":"slow down"}}')).toBe('The model provider limits the requests now. Try again later.');
    expect(plainError('model: anthropic: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')).toBe('The model provider is overloaded. Try again later.');
    expect(plainError('model: anthropic: POST "https://x": 502 Bad Gateway')).toBe('The model provider failed. Try again later.');
    expect(plainError('model: context deadline exceeded')).toBe('The model did not answer in time.');
  });

  it('words a spent budget, a limit, and a stop', () => {
    expect(plainError('budget exceeded: cost 2.10 of 2.00 USD')).toBe('The run used up its budget.');
    expect(plainError('Stopped at the limit of 40 turns.')).toBe('Stopped at 40 turns');
    expect(plainError('budget: the run reached its limit of 2.00 USD. Raise it to go on.')).toBe('Stopped at 2.00 USD');
    expect(plainError('context canceled')).toBe('The run was stopped.');
  });

  it('keeps the first sentence of any other error, without addresses, ids, or JSON', () => {
    expect(plainError('tool bash: dial tcp "http://10.0.0.4:9000/x": connection refused. Retried 3 times. {"a":1}')).toBe('Tool bash: dial tcp: connection refused.');
    expect(plainError('run 01m5kpw79kyq9j8nbpnhvtwm95 lost its worker')).toBe('Run lost its worker.');
    expect(plainError('')).toBe('');
  });
});
