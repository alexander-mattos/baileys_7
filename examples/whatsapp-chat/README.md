# WhatsApp Chat Demo

A WhatsApp-inspired chat experience implemented with Next.js 14 and the App Router. The UI mimics the familiar dual-column layout with a conversation list, message thread, and composer.

## Getting started

```bash
cd examples/whatsapp-chat
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

## Features

- Conversation list with unread indicators and timestamp formatting
- Search-as-you-type filtering for conversations and last messages
- Message thread with WhatsApp-style bubbles and delivery state glyphs
- Inline composer that supports pressing <kbd>Enter</kbd> to send and <kbd>Shift</kbd>+<kbd>Enter</kbd> for new lines
- Automatically scrolls to the latest message and bumps active chats to the top when you reply
- Local state management for sending sample messages without a backend
