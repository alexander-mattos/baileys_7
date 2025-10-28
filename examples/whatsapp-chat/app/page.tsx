"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { format, isToday, isYesterday } from "date-fns";
import styles from "./page.module.css";
import conversationsSeed, {
  Conversation,
  Message,
  MessageStatus
} from "@/data/conversations";

const statusIcons: Record<MessageStatus, string> = {
  sent: "✓",
  delivered: "✓✓",
  read: "✓✓"
};

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);

  if (isToday(date)) {
    return format(date, "HH:mm");
  }

  if (isYesterday(date)) {
    return "Yesterday";
  }

  return format(date, "dd/MM/yy");
};

const formatFullTimestamp = (iso: string) => format(new Date(iso), "HH:mm");

type ConversationState = Conversation & {
  lastMessage?: Message;
};

const enhanceConversation = (conversation: Conversation): ConversationState => {
  const lastMessage = conversation.messages.at(-1);

  return {
    ...conversation,
    messages: conversation.messages.map((message) => ({ ...message })),
    lastMessage
  };
};

export default function Page() {
  const [conversations, setConversations] = useState<ConversationState[]>(() =>
    conversationsSeed.map((conversation) => enhanceConversation(conversation))
  );
  const [selectedConversationId, setSelectedConversationId] = useState(
    conversationsSeed[0]?.id ?? ""
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const messageViewportRef = useRef<HTMLDivElement | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId]
  );

  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) {
      return conversations;
    }

    const query = searchTerm.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (conversation.contactName.toLowerCase().includes(query)) {
        return true;
      }

      const lastMessageBody = conversation.lastMessage?.body ?? "";

      return lastMessageBody.toLowerCase().includes(query);
    });
  }, [conversations, searchTerm]);

  const selectedMessageCount = selectedConversation?.messages.length ?? 0;

  useEffect(() => {
    const viewport = messageViewportRef.current;

    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [selectedConversation?.id, selectedMessageCount]);

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation
      )
    );
  };

  const handleDraftChange = (conversationId: string, value: string) => {
    setDrafts((current) => ({ ...current, [conversationId]: value }));
  };

  const handleSendMessage = () => {
    if (!selectedConversation) {
      return;
    }

    const draft = drafts[selectedConversation.id]?.trim();

    if (!draft) {
      return;
    }

    const newMessage: Message = {
      id: `local-${Date.now()}`,
      sender: "me",
      body: draft,
      timestamp: new Date().toISOString(),
      status: "sent"
    };

    setConversations((current) =>
      current
        .map((conversation) => {
          if (conversation.id !== selectedConversation.id) {
            return conversation;
          }

          const updatedMessages = [...conversation.messages, newMessage];

          return {
            ...conversation,
            messages: updatedMessages,
            lastMessage: newMessage,
            unreadCount: 0
          };
        })
        .sort((first, second) => {
          const firstTimestamp = first.lastMessage
            ? new Date(first.lastMessage.timestamp).getTime()
            : 0;
          const secondTimestamp = second.lastMessage
            ? new Date(second.lastMessage.timestamp).getTime()
            : 0;

          return secondTimestamp - firstTimestamp;
        })
    );

    setDrafts((current) => ({ ...current, [selectedConversation.id]: "" }));
  };

  const selectedDraft = selectedConversation
    ? drafts[selectedConversation.id] ?? ""
    : "";

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Chats</span>
          <span className={styles.profileBadge}>JD</span>
        </div>
        <div className={styles.searchBox}>
          <input
            aria-label="Search chat"
            className={styles.searchInput}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search or start new chat"
            type="search"
            value={searchTerm}
          />
        </div>
        <div className={styles.conversationList}>
          {filteredConversations.length === 0 ? (
            <p className={styles.emptyListMessage}>No conversations found</p>
          ) : (
            filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                className={clsx(styles.conversationButton, {
                  [styles.conversationButtonActive]:
                    conversation.id === selectedConversationId
                })}
                onClick={() => handleSelectConversation(conversation.id)}
                type="button"
              >
                <span className={styles.avatar}>{conversation.contactInitials}</span>
                <span className={styles.conversationMeta}>
                  <span className={styles.conversationName}>
                    {conversation.contactName}
                  </span>
                  {conversation.lastMessage ? (
                    <span className={styles.conversationTimestamp}>
                      {formatTimestamp(conversation.lastMessage.timestamp)}
                    </span>
                  ) : (
                    <span />
                  )}
                  {conversation.lastMessage ? (
                    <span className={styles.conversationPreview}>
                      {conversation.lastMessage.body}
                    </span>
                  ) : (
                    <span className={styles.conversationPreview}>
                      Start the conversation
                    </span>
                  )}
                  {conversation.unreadCount ? (
                    <span className={styles.badge}>{conversation.unreadCount}</span>
                  ) : (
                    <span />
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
      <section className={styles.chatPanel}>
        {selectedConversation ? (
          <>
            <header className={styles.chatHeader}>
              <span className={styles.avatar}>
                {selectedConversation.contactInitials}
              </span>
              <div className={styles.headerDetails}>
                <span className={styles.contactName}>
                  {selectedConversation.contactName}
                </span>
                <span className={styles.lastSeen}>
                  {selectedConversation.lastSeen}
                </span>
              </div>
            </header>
            <div className={styles.messageViewport} ref={messageViewportRef}>
              {selectedConversation.messages.map((message) => {
                const isOutgoing = message.sender === "me";

                return (
                  <div
                    key={message.id}
                    className={clsx(styles.messageGroup, {
                      [styles.messageOutgoing]: isOutgoing
                    })}
                  >
                    <div className={styles.messageBubble}>
                      {message.body}
                      <span className={styles.messageTimestamp}>
                        {formatFullTimestamp(message.timestamp)}
                        {message.status ? (
                          <span
                            className={clsx(styles.messageStatus, {
                              [styles.messageStatusRead]: message.status === "read"
                            })}
                          >
                            {statusIcons[message.status]}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={styles.composer}>
              <textarea
                aria-label="Type a message"
                className={styles.textArea}
                onChange={(event) =>
                  handleDraftChange(selectedConversation.id, event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Type a message"
                value={selectedDraft}
              />
              <button
                className={styles.sendButton}
                disabled={!selectedDraft.trim()}
                onClick={handleSendMessage}
                type="button"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <h2>Select a chat to start messaging</h2>
            <p>Your conversations will show up here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
