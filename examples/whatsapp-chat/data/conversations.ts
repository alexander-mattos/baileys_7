export type MessageStatus = "sent" | "delivered" | "read";
export type MessageSender = "me" | "them";

export interface Message {
  id: string;
  sender: MessageSender;
  body: string;
  timestamp: string;
  status?: MessageStatus;
}

export interface Conversation {
  id: string;
  contactName: string;
  contactInitials: string;
  lastSeen: string;
  messages: Message[];
  unreadCount?: number;
}

const minutesAgo = (minutes: number) => {
  const date = new Date(Date.now() - minutes * 60 * 1000);
  return date.toISOString();
};

const conversations: Conversation[] = [
  {
    id: "team-design",
    contactName: "Design Team",
    contactInitials: "DT",
    lastSeen: "last seen 2 minutes ago",
    unreadCount: 2,
    messages: [
      {
        id: "m-1",
        sender: "them",
        body: "Morning! Do you have the updated assets for the promo?",
        timestamp: minutesAgo(35),
        status: "delivered"
      },
      {
        id: "m-2",
        sender: "me",
        body: "Yes, uploading them now. Give me 5 minutes.",
        timestamp: minutesAgo(32),
        status: "read"
      },
      {
        id: "m-3",
        sender: "them",
        body: "Perfect, we want to lock the mockups before stand-up.",
        timestamp: minutesAgo(28),
        status: "sent"
      }
    ]
  },
  {
    id: "event-team",
    contactName: "Event Crew",
    contactInitials: "EC",
    lastSeen: "online",
    messages: [
      {
        id: "m-4",
        sender: "me",
        body: "Venue confirmed for Saturday!",
        timestamp: minutesAgo(120),
        status: "read"
      },
      {
        id: "m-5",
        sender: "them",
        body: "Amazing. Do we have a backup projector?",
        timestamp: minutesAgo(118),
        status: "read"
      },
      {
        id: "m-6",
        sender: "me",
        body: "Yes, already on the equipment list.",
        timestamp: minutesAgo(115),
        status: "read"
      }
    ]
  },
  {
    id: "family",
    contactName: "Family",
    contactInitials: "FA",
    lastSeen: "last seen yesterday",
    unreadCount: 5,
    messages: [
      {
        id: "m-7",
        sender: "them",
        body: "Group call tonight at 7pm?",
        timestamp: minutesAgo(720),
        status: "sent"
      },
      {
        id: "m-8",
        sender: "me",
        body: "I'll be there!",
        timestamp: minutesAgo(715),
        status: "delivered"
      }
    ]
  }
];

export default conversations;
