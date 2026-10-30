import { navigateWithAgentChatViewTransition } from "@agent-native/core/client/agent-chat";
import { focusAgentChat } from "@agent-native/toolkit/app/chat";
import { AgentSidebar } from "@agent-native/toolkit/app/chat";
import { type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

import { chatThreadPath } from "@/lib/chat-paths";
import { TAB_ID } from "@/lib/tab-id";

interface AgentInspectorProps {
  children: ReactNode;
  chatHomeHandoffActive: boolean;
  chatHomeHandoffPending: boolean;
}

/** Contextual inspector shell used on secondary chat routes. */
export function AgentInspector({
  children,
  chatHomeHandoffActive,
  chatHomeHandoffPending,
}: AgentInspectorProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const suggestions = pathname.startsWith("/market")
    ? [
        "Consult Socrates, Taleb and the Statistician on this market",
        "Who is staked on each side, and how big are the positions?",
        "What would make this market settle as a refund?",
      ]
    : pathname.startsWith("/studio")
      ? [
          "Draft this claim and run the council preflight",
          "Tighten the question so one source can settle it",
          "Is the deadline safe for this category?",
        ]
      : [
          "Where is the council split on sports markets?",
          "Which live markets close in the next 24 hours?",
          "Draft a claim about next week's weather in London",
        ];

  function openAskAgentFullscreen(threadId?: string) {
    focusAgentChat();
    navigateWithAgentChatViewTransition(navigate, chatThreadPath(threadId));
  }

  return (
    <AgentSidebar
      position="right"
      chatViewTransition
      chatViewTransitionHandoff={chatHomeHandoffPending}
      storageKey="chat"
      browserTabId={TAB_ID}
      openOnChatRunning={chatHomeHandoffActive}
      onFullscreenRequest={openAskAgentFullscreen}
      emptyStateText="Ask about markets, consult the council, or shape a claim."
      agentPageHref="/settings/agent"
      suggestions={suggestions}
    >
      {children}
    </AgentSidebar>
  );
}
