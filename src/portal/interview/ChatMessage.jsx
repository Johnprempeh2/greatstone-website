/**
 * Chat bubbles, per the signed-off mockup:
 *   - agent: lime left rule, soft lime gradient, stone avatar to the left
 *   - employee ("user"): right-aligned muted card with a tucked corner
 *   - current-question emphasis: slightly larger, medium weight (is-question)
 *   - typing dots: three pulsing lime dots
 *
 * Port: source components/ChatMessage.tsx, types dropped; the stone mark is bundled from this folder
 * (source: /gs-stone.png in the Next public folder).
 */

import stoneUrl from './assets/gs-stone.png';

/** The Greatstone stacked-stone mark used as the agent's avatar. */
export function AgentAvatar() {
  return (
    <div className="agent-avatar" aria-hidden="true">
      <img src={stoneUrl} alt="" aria-hidden="true" />
    </div>
  );
}

/** The three-dot typing / streaming indicator. */
export function TypingDots() {
  return (
    <span className="typing" aria-label="Everest is still typing">
      <span></span>
      <span></span>
      <span></span>
    </span>
  );
}

export function ChatMessage({ role, isQuestion = false, typing = false, children }) {
  if (role === 'agent') {
    return (
      <div className={isQuestion ? 'msg msg-agent is-question' : 'msg msg-agent'}>
        <AgentAvatar />
        <div>
          <div className="bubble">
            {children}
            {typing ? <TypingDots /> : null}
          </div>
          <div className="msg-meta">{typing ? 'Everest · typing' : 'Everest'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="msg msg-user">
      <div>
        <div className="bubble">{children}</div>
        <div className="msg-meta">You</div>
      </div>
    </div>
  );
}
