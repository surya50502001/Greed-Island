import React, { useState } from 'react';
import {
  AccompanyInvite,
  SpellTravelCardId,
  SpellTravelContext,
} from '../../domain/cards/spellTravel';

interface SpellCardModalProps {
  cardId: SpellTravelCardId | null;
  context: SpellTravelContext | null;
  acceptedCompanions: Array<{ playerId: string; characterName: string }>;
  errorMessage: string | null;
  isBusy: boolean;
  onInviteCompanions: (targetIds: string[], destinationLabel: string) => void;
  onConfirmTravel: (params: {
    cardId: SpellTravelCardId;
    destinationType: 'town' | 'player';
    targetId: string;
    companionPlayerIds: string[];
  }) => void;
  onClose: () => void;
}

export const SpellCardModal: React.FC<SpellCardModalProps> = ({
  cardId,
  context,
  acceptedCompanions,
  errorMessage,
  isBusy,
  onInviteCompanions,
  onConfirmTravel,
  onClose,
}) => {
  const [destType, setDestType] = useState<'town' | 'player'>(
    cardId === 'magnetic_force' ? 'player' : 'town'
  );
  const [selectedId, setSelectedId] = useState<string>('');
  const [invitedIds, setInvitedIds] = useState<Set<string>>(() => new Set());

  if (!cardId || !context) return null;

  const visitedTowns = context.allTowns.filter((t) =>
    context.visitedTownIds.includes(t.id)
  );
  const metPlayers = context.metPlayers;

  const effectiveDestType: 'town' | 'player' =
    cardId === 'magnetic_force'
      ? 'player'
      : cardId === 'return'
        ? 'town'
        : destType;

  const activeList = effectiveDestType === 'town' ? visitedTowns : metPlayers;
  const chosenId =
    selectedId &&
    activeList.some((x) => ('id' in x ? x.id === selectedId : x.playerId === selectedId))
      ? selectedId
      : effectiveDestType === 'town'
        ? visitedTowns[0]?.id ?? ''
        : metPlayers[0]?.playerId ?? '';

  const chosenLabel =
    effectiveDestType === 'town'
      ? visitedTowns.find((t) => t.id === chosenId)?.name ?? 'Destination'
      : metPlayers.find((p) => p.playerId === chosenId)?.characterName ?? 'Hunter';

  const cardTitle =
    cardId === 'accompany'
      ? 'ACCOMPANY'
      : cardId === 'magnetic_force'
        ? 'MAGNETIC FORCE'
        : 'RETURN';

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 55,
        background: 'rgba(5, 8, 14, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(440px, 95vw)',
          maxHeight: '88vh',
          overflowY: 'auto',
          borderRadius: '14px',
          background: 'rgba(11, 14, 21, 0.96)',
          border: '1.5px solid rgba(212, 175, 55, 0.45)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
          padding: '18px',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#f3e8c8', letterSpacing: '0.05em' }}>
              {cardTitle}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {cardId === 'return'
                ? 'Select a previously visited town'
                : cardId === 'magnetic_force'
                  ? 'Select a previously met hunter to fly to'
                  : 'Select destination & invite companions'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(148,163,184,0.28)',
              background: 'rgba(30,41,59,0.8)',
              color: '#e2e8f0',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {cardId === 'accompany' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setDestType('town');
                setSelectedId('');
              }}
              style={{
                flex: 1,
                padding: '7px',
                borderRadius: '8px',
                border: `1px solid ${destType === 'town' ? '#f59e0b' : 'rgba(148,163,184,0.25)'}`,
                background: destType === 'town' ? 'rgba(120,53,15,0.45)' : 'rgba(20,26,38,0.8)',
                color: '#f8fafc',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Visited Towns ({visitedTowns.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setDestType('player');
                setSelectedId('');
              }}
              style={{
                flex: 1,
                padding: '7px',
                borderRadius: '8px',
                border: `1px solid ${destType === 'player' ? '#f59e0b' : 'rgba(148,163,184,0.25)'}`,
                background: destType === 'player' ? 'rgba(120,53,15,0.45)' : 'rgba(20,26,38,0.8)',
                color: '#f8fafc',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Met Players ({metPlayers.length})
            </button>
          </div>
        )}

        {/* Destination List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {effectiveDestType === 'town' ? (
            visitedTowns.map((town) => (
              <button
                key={town.id}
                type="button"
                onClick={() => setSelectedId(town.id)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${chosenId === town.id ? '#fbbf24' : 'rgba(148,163,184,0.2)'}`,
                  background: chosenId === town.id ? 'rgba(120,53,15,0.35)' : 'rgba(20,26,38,0.75)',
                  color: '#f8fafc',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {town.name}
              </button>
            ))
          ) : metPlayers.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
              No met hunters online yet. Approach another hunter in the world first to record an encounter.
            </div>
          ) : (
            metPlayers.map((mp) => (
              <button
                key={mp.playerId}
                type="button"
                onClick={() => setSelectedId(mp.playerId)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${chosenId === mp.playerId ? '#38bdf8' : 'rgba(148,163,184,0.2)'}`,
                  background: chosenId === mp.playerId ? 'rgba(14,116,144,0.35)' : 'rgba(20,26,38,0.75)',
                  color: '#f8fafc',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {mp.characterName}
              </button>
            ))
          )}
        </div>

        {/* Accompany Companion Invites */}
        {cardId === 'accompany' && metPlayers.length > 0 && (
          <div
            style={{
              padding: '10px',
              borderRadius: '8px',
              background: 'rgba(20,26,38,0.75)',
              border: '1px solid rgba(148,163,184,0.18)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#e2c275' }}>
              Invite Travelling Companions (Optional)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {metPlayers.map((mp) => {
                const isInvited = invitedIds.has(mp.playerId);
                const isAccepted = acceptedCompanions.some((c) => c.playerId === mp.playerId);
                return (
                  <button
                    key={mp.playerId}
                    type="button"
                    onClick={() => {
                      setInvitedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(mp.playerId)) next.delete(mp.playerId);
                        else next.add(mp.playerId);
                        return next;
                      });
                    }}
                    style={{
                      padding: '4px 9px',
                      borderRadius: '999px',
                      border: `1px solid ${isAccepted ? '#22c55e' : isInvited ? '#fbbf24' : 'rgba(148,163,184,0.3)'}`,
                      background: isAccepted ? 'rgba(20,83,45,0.5)' : isInvited ? 'rgba(120,53,15,0.45)' : 'transparent',
                      color: '#f8fafc',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    {mp.characterName} {isAccepted ? '✓ Joined' : isInvited ? '• Selected' : ''}
                  </button>
                );
              })}
            </div>
            {invitedIds.size > 0 && (
              <button
                type="button"
                onClick={() => onInviteCompanions(Array.from(invitedIds), chosenLabel)}
                style={{
                  alignSelf: 'flex-start',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(251,191,36,0.5)',
                  background: 'rgba(146,64,14,0.6)',
                  color: '#fef3c7',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Send Party Invite
              </button>
            )}
          </div>
        )}

        {errorMessage && (
          <div style={{ fontSize: '11px', color: '#fca5a5', fontWeight: 600 }}>
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          disabled={!chosenId || isBusy}
          onClick={() =>
            onConfirmTravel({
              cardId,
              destinationType: effectiveDestType,
              targetId: chosenId,
              companionPlayerIds: acceptedCompanions.map((c) => c.playerId),
            })
          }
          style={{
            padding: '10px 14px',
            borderRadius: '9px',
            border: '1px solid rgba(212,175,55,0.65)',
            background: !chosenId || isBusy ? 'rgba(51,65,85,0.6)' : 'rgba(146,64,14,0.85)',
            color: '#fef3c7',
            fontSize: '13px',
            fontWeight: 800,
            cursor: !chosenId || isBusy ? 'not-allowed' : 'pointer',
          }}
        >
          {isBusy ? 'Casting...' : `Cast ${cardTitle} → ${chosenLabel}`}
        </button>
      </div>
    </div>
  );
};

interface AccompanyInviteBannerProps {
  invite: AccompanyInvite | null;
  onRespond: (inviteId: string, accept: boolean) => void;
}

export const AccompanyInviteBanner: React.FC<AccompanyInviteBannerProps> = ({
  invite,
  onRespond,
}) => {
  if (!invite) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(54px + env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 35,
        padding: '10px 14px',
        borderRadius: '10px',
        background: 'rgba(11, 14, 21, 0.94)',
        border: '1.5px solid rgba(251, 191, 36, 0.65)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.6)',
        color: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontSize: '12px' }}>
        <strong>{invite.leaderName}</strong> invites you to <strong>Accompany</strong> →{' '}
        <span style={{ color: '#fde68a' }}>{invite.destinationLabel}</span>
      </div>
      <button
        type="button"
        onClick={() => onRespond(invite.inviteId, true)}
        style={{
          padding: '5px 10px',
          borderRadius: '6px',
          border: '1px solid #22c55e',
          background: 'rgba(20,83,45,0.75)',
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Join
      </button>
      <button
        type="button"
        onClick={() => onRespond(invite.inviteId, false)}
        style={{
          padding: '5px 8px',
          borderRadius: '6px',
          border: '1px solid rgba(148,163,184,0.35)',
          background: 'transparent',
          color: '#cbd5e1',
          fontSize: '11px',
          cursor: 'pointer',
        }}
      >
        Decline
      </button>
    </div>
  );
};
