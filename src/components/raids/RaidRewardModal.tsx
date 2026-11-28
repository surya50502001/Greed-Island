import React from 'react';
import { RaidRewardGrant } from '../../domain/rewards/types';

interface RaidRewardModalProps {
  grant: RaidRewardGrant | null;
  onClose: () => void;
}

export const RaidRewardModal: React.FC<RaidRewardModalProps> = ({ grant, onClose }) => {
  if (!grant) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 45,
        background: 'rgba(2, 6, 23, 0.76)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(420px, 92vw)',
          padding: '22px',
          borderRadius: '16px',
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1.5px solid rgba(250, 204, 21, 0.7)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '19px', fontWeight: 900, color: '#fde047' }}>
            RAID VICTORY REWARDS
          </div>
          <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
            Tier {grant.tier} Completion · Claimed Once
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {grant.items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '9px 12px',
                borderRadius: '10px',
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(192, 132, 252, 0.4)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '13px',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: '#f3e8ff' }}>{item.label}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
                  {item.category.replace('_', ' ')}
                </div>
              </div>
              <span style={{ fontWeight: 800, color: '#fde047' }}>×{item.quantity}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: '4px',
            padding: '9px 14px',
            borderRadius: '9px',
            border: '1px solid rgba(250, 204, 21, 0.7)',
            background: 'linear-gradient(135deg, #ca8a04, #ea580c)',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Collect & Continue
        </button>
      </div>
    </div>
  );
};
