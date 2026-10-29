// LineText words the quiet lines of a view: the system lines of a channel,
// the names and the step lines of a conversation. The older places keep the
// sentences as they are. The chat-first page (src/ui/chat) says channel,
// job, and joined where the older places say team, duty, and took the seat.

import { createContext } from 'preact';

export const LineText = createContext<(text: string) => string>((t) => t);
