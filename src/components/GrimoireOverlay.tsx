/**
 * GrimoireOverlay.tsx
 * Full-screen DOM overlay presenting the Grimoire as a premium two-page fantasy book.
 * Handles: card browsing, page navigation, card inspection, quick-cast input, and activation.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CARD_DEFINITIONS, CardDefinition } from '../types/game';
import {
  ActiveCardLoadout,
  ActiveCardSlotIndex,
  AnyCardId,
  CardCooldownMap,
  CardInventory,
  DEFAULT_MAX_CARD_LEVEL,
  OwnedCardEntry,
} from '../domain/cards/types';
import { canActivateCard, getCardUpgradeCost } from '../domain/cards/rules';
import {
  indexToShortcut,
  isExactMatch,
  isValidPrefix,
  shortcutToIndex,
} from '../utils/shortcutLabels';
import { getSpreadLayout, getTotalSpreads } from '../utils/pageLayout';
import './GrimoireOverlay.css';

// ─── Artwork Canvas Renderer ─────────────────────────────────────────────────

function drawCardArt(canvas: HTMLCanvasElement, card: CardDefinition, isActive: boolean) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#060310');
  bg.addColorStop(0.5, '#0d0820');
  bg.addColorStop(1, '#030108');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;

  // Halo
  const halo = ctx.createRadialGradient(cx, cy, 4, cx, cy, W * 0.45);
  halo.addColorStop(0, card.accentColor + '44');
  halo.addColorStop(0.5, card.glowColor + '1a');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, W * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Outer ring
  ctx.strokeStyle = card.glowColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, W * 0.33, 0, Math.PI * 2);
  ctx.stroke();

  // Icon based on card id
  ctx.save();
  ctx.translate(cx, cy);

  if (card.id === 'flight') {
    // Twin wings
    ctx.fillStyle = card.glowColor;
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.scale(dir * (W / 320), W / 320);
      ctx.beginPath();
      ctx.moveTo(6, 12);
      ctx.quadraticCurveTo(32, -22, 46, -12);
      ctx.quadraticCurveTo(30, 2, 38, 12);
      ctx.quadraticCurveTo(20, 14, 10, 20);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Central arrow
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, (W / 320) * 22);
    ctx.lineTo(0, -(W / 320) * 24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-(W / 320) * 8, -(W / 320) * 14);
    ctx.lineTo(0, -(W / 320) * 24);
    ctx.lineTo((W / 320) * 8, -(W / 320) * 14);
    ctx.stroke();
  } else if (card.id === 'weapon') {
    // Energy sword
    const s = W / 320;
    ctx.save();
    ctx.rotate(-Math.PI / 5);
    // Blade glow
    const bladeGlow = ctx.createLinearGradient(0, -s * 46, 0, s * 18);
    bladeGlow.addColorStop(0, '#ffffff');
    bladeGlow.addColorStop(0.3, '#a5f3fc');
    bladeGlow.addColorStop(1, card.accentColor + '88');
    ctx.fillStyle = bladeGlow;
    ctx.beginPath();
    ctx.moveTo(0, -s * 46);
    ctx.lineTo(s * 7, -s * 30);
    ctx.lineTo(s * 5, s * 16);
    ctx.lineTo(-s * 5, s * 16);
    ctx.lineTo(-s * 7, -s * 30);
    ctx.closePath();
    ctx.fill();
    // Crossguard
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-s * 18, s * 14, s * 36, s * 6);
    // Hilt
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-s * 4, s * 20, s * 8, s * 16);
    ctx.restore();
  } else if (card.id === 'invisibility') {
    // Spectral eye
    const s = W / 320;
    ctx.strokeStyle = card.glowColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-s * 38, 0);
    ctx.quadraticCurveTo(0, -s * 28, s * 38, 0);
    ctx.quadraticCurveTo(0, s * 28, -s * 38, 0);
    ctx.stroke();
    // Iris
    const iris = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 12);
    iris.addColorStop(0, '#ffffff');
    iris.addColorStop(0.4, card.accentColor);
    iris.addColorStop(1, card.glowColor + '88');
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(0, 0, s * 12, 0, Math.PI * 2);
    ctx.fill();
    // Pupil
    ctx.fillStyle = '#0a0618';
    ctx.beginPath();
    ctx.arc(0, 0, s * 5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Generic rune symbol
    const s = W / 320;
    ctx.strokeStyle = card.glowColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, s * 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = card.accentColor;
    ctx.font = `bold ${s * 28}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 0, 0);
  }

  ctx.restore();

  // Active glow overlay
  if (isActive) {
    ctx.fillStyle = 'rgba(74, 222, 128, 0.12)';
    ctx.fillRect(0, 0, W, H);
  }
}

// ─── Mini Card Art Component ──────────────────────────────────────────────────

function CardArtCanvas({
  card,
  isActive,
  size = 200,
}: {
  card: CardDefinition;
  isActive: boolean;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    drawCardArt(canvas, card, isActive);
  }, [card, isActive, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

// ─── Rarity Helpers ───────────────────────────────────────────────────────────

function rarityClass(rarity: string): string {
  return `rarity-${rarity.toLowerCase()}`;
}

function rarityLabel(rarity: string): string {
  const stars: Record<string, string> = {
    Common: '◆',
    Rare: '◆◆',
    Epic: '◆◆◆',
    Mythic: '✦✦✦✦',
    Legendary: '★★★★★',
  };
  return `${stars[rarity] ?? '◆'} ${rarity}`;
}

// ─── Single Card in Grid ──────────────────────────────────────────────────────

interface GrimoireCardItemProps {
  card: CardDefinition<AnyCardId>;
  entry: OwnedCardEntry;
  equippedSlot: number; // -1 if not equipped
  cooldownSec: number;
  cardIndex: number; // 0-based
  totalCards: number;
  isActive: boolean;
  isSelected: boolean;
  isShortcutMatch: boolean;
  onSelect: (id: AnyCardId) => void;
}

const GrimoireCardItem = React.memo(function GrimoireCardItem({
  card,
  entry,
  equippedSlot,
  cooldownSec,
  cardIndex,
  isActive,
  isSelected,
  isShortcutMatch,
  onSelect,
}: GrimoireCardItemProps) {
  const shortcut = indexToShortcut(cardIndex + 1);

  const classes = [
    'grimoire-card',
    rarityClass(card.rarity),
    isSelected ? 'selected' : '',
    isShortcutMatch ? 'shortcut-match' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="grimoire-card-slot">
      <div
        className={classes}
        onClick={() => onSelect(card.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(card.id); }}
        aria-label={`${card.name} — ${card.rarity}`}
      >
        <div className="grimoire-card-frame">
          {/* Artwork */}
          <div className="grimoire-card-art">
            <CardArtCanvas card={card as CardDefinition} isActive={isActive} size={160} />
          </div>

          {/* Rarity divider */}
          <div className="grimoire-card-rarity-stripe" />

          {/* Info */}
          <div className="grimoire-card-info">
            <div className="grimoire-card-name">{card.name}</div>
            <div className="grimoire-card-category">
              Lv.{entry.level} · {entry.duplicates} dup
              {equippedSlot >= 0 ? ` · S${equippedSlot + 1}` : ''}
            </div>
            <div className="grimoire-card-rarity-badge">
              {cooldownSec > 0 ? `⏳ ${Math.ceil(cooldownSec)}s` : rarityLabel(card.rarity)}
            </div>
          </div>

          {/* Shortcut badge */}
          <div className="grimoire-card-shortcut">{shortcut}</div>

          {/* Active indicator */}
          {isActive && <div className="grimoire-card-active-indicator" />}
        </div>
      </div>
    </div>
  );
});

// ─── Empty Slot ───────────────────────────────────────────────────────────────

function EmptySlot() {
  return <div className="grimoire-card-slot empty" />;
}

// ─── Inspection Panel ─────────────────────────────────────────────────────────

interface InspectionPanelProps {
  card: CardDefinition<AnyCardId>;
  entry: OwnedCardEntry;
  loadout: ActiveCardLoadout;
  cooldownSec: number;
  cardIndex: number;
  isActive: boolean;
  onActivate: (id: AnyCardId) => void;
  onEquip: (id: AnyCardId, slot: ActiveCardSlotIndex) => void;
  onUnequipSlot: (slot: ActiveCardSlotIndex) => void;
  onUpgrade: (id: AnyCardId) => void;
}

function InspectionPanel({
  card,
  entry,
  loadout,
  cooldownSec,
  cardIndex,
  isActive,
  onActivate,
  onEquip,
  onUnequipSlot,
  onUpgrade,
}: InspectionPanelProps) {
  const shortcut = indexToShortcut(cardIndex + 1);
  const equippedSlot = loadout.slots.indexOf(card.id);
  const maxLevel = card.maxLevel ?? DEFAULT_MAX_CARD_LEVEL;
  const isMaxLevel = entry.level >= maxLevel;
  const upgradeCost = getCardUpgradeCost(entry.level);
  const canUpgrade = !isMaxLevel && entry.duplicates >= upgradeCost;
  const activationCheck = canActivateCard(card.id, loadout, { [card.id]: cooldownSec });

  return (
    <div
      className={`grimoire-inspection-panel ${rarityClass(card.rarity)}`}
      style={{ '--card-accent': getComputedRarityAccent(card.rarity) } as React.CSSProperties}
    >
      {/* Large card preview */}
      <div
        className={`grimoire-inspection-card-preview ${rarityClass(card.rarity)}`}
        style={{ '--card-accent': getComputedRarityAccent(card.rarity) } as React.CSSProperties}
      >
        <CardArtCanvas card={card as CardDefinition} isActive={isActive} size={320} />
      </div>

      {/* Details */}
      <div className="grimoire-inspection-details">
        <div className="grimoire-inspection-name">{card.name}</div>

        <div className="grimoire-inspection-row">
          <span className="grimoire-inspection-label">Category</span>
          <span className="grimoire-inspection-value">{card.category}</span>
        </div>
        <div className="grimoire-inspection-row">
          <span className="grimoire-inspection-label">Rarity</span>
          <span className="grimoire-inspection-value">{rarityLabel(card.rarity)}</span>
        </div>
        <div className="grimoire-inspection-row">
          <span className="grimoire-inspection-label">Level</span>
          <span className="grimoire-inspection-value">
            Lv.{entry.level} / {maxLevel}
          </span>
        </div>
        <div className="grimoire-inspection-row">
          <span className="grimoire-inspection-label">Duplicates</span>
          <span className="grimoire-inspection-value">
            {entry.duplicates} {isMaxLevel ? '(MAX)' : `(Next: ${upgradeCost})`}
          </span>
        </div>
        <div className="grimoire-inspection-row">
          <span className="grimoire-inspection-label">Quick-Cast</span>
          <span className="grimoire-inspection-value"
            style={{ fontFamily: 'Cinzel, monospace', letterSpacing: '0.1em' }}>
            G → {shortcut}
          </span>
        </div>
        <div className="grimoire-inspection-row">
          <span className="grimoire-inspection-label">Status</span>
          <span
            className="grimoire-inspection-value"
            style={{ color: isActive ? '#4ade80' : equippedSlot >= 0 ? '#7dd3fc' : '#94a3b8' }}
          >
            {isActive ? '● Active' : equippedSlot >= 0 ? `Slot ${equippedSlot + 1}` : '○ Unequipped'}
          </span>
        </div>

        <div className="grimoire-inspection-desc">{card.description}</div>

        {/* 4 Active Slot Equip Controls */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          {([0, 1, 2, 3] as ActiveCardSlotIndex[]).map((slotIdx) => {
            const isThisSlot = equippedSlot === slotIdx;
            return (
              <button
                key={slotIdx}
                type="button"
                onClick={() => (isThisSlot ? onUnequipSlot(slotIdx) : onEquip(card.id, slotIdx))}
                style={{
                  flex: 1,
                  padding: '5px 4px',
                  borderRadius: '6px',
                  border: `1px solid ${isThisSlot ? '#38bdf8' : 'rgba(212,176,96,0.35)'}`,
                  background: isThisSlot ? 'rgba(14, 116, 144, 0.7)' : 'rgba(15, 23, 42, 0.75)',
                  color: '#f8fafc',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isThisSlot ? `Unequip ${slotIdx + 1}` : `Slot ${slotIdx + 1}`}
              </button>
            );
          })}
        </div>

        {/* Upgrade Button */}
        <button
          type="button"
          disabled={!canUpgrade}
          onClick={() => onUpgrade(card.id)}
          style={{
            marginTop: '6px',
            width: '100%',
            padding: '7px 10px',
            borderRadius: '8px',
            border: `1px solid ${canUpgrade ? '#fbbf24' : 'rgba(148,163,184,0.25)'}`,
            background: canUpgrade
              ? 'linear-gradient(135deg, #b45309, #d97706)'
              : 'rgba(30, 41, 59, 0.6)',
            color: canUpgrade ? '#ffffff' : '#94a3b8',
            fontSize: '12px',
            fontWeight: 700,
            cursor: canUpgrade ? 'pointer' : 'not-allowed',
          }}
        >
          {isMaxLevel
            ? '★ MAX LEVEL REACHED'
            : canUpgrade
              ? `▲ UPGRADE TO LV.${entry.level + 1} (${upgradeCost} DUP)`
              : `UPGRADE NEEDS ${upgradeCost} DUP`}
        </button>

        <button
          type="button"
          disabled={!activationCheck.allowed}
          className={`grimoire-cast-btn ${isActive ? 'active-state' : ''} ${rarityClass(card.rarity)}`}
          style={{
            opacity: activationCheck.allowed ? 1 : 0.5,
            cursor: activationCheck.allowed ? 'pointer' : 'not-allowed',
          }}
          onClick={() => activationCheck.allowed && onActivate(card.id)}
        >
          {activationCheck.reason === 'not_equipped'
            ? 'EQUIP TO SLOT FIRST'
            : activationCheck.reason === 'on_cooldown'
              ? `COOLDOWN (${Math.ceil(cooldownSec)}s)`
              : isActive
                ? '✦ DEACTIVATE'
                : '✦ CAST SPELL'}
        </button>
      </div>
    </div>
  );
}

function getComputedRarityAccent(rarity: string): string {
  const map: Record<string, string> = {
    Common: '#94a3b8',
    Rare: '#38bdf8',
    Epic: '#c084fc',
    Mythic: '#f5c842',
    Legendary: '#fb923c',
  };
  return map[rarity] ?? '#c09a30';
}

// ─── Quick-Cast Display ────────────────────────────────────────────────────────

interface QuickCastDisplayProps {
  inputBuffer: string;
  isValidPfx: boolean;
  isMatch: boolean;
  isInvalid: boolean;
  totalCards: number;
}

function QuickCastDisplay({
  inputBuffer,
  isValidPfx,
  isMatch,
  isInvalid,
}: QuickCastDisplayProps) {
  const inputClass = [
    'grimoire-quickcast-input',
    isInvalid ? 'invalid' : '',
    isMatch ? 'match' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="grimoire-quickcast">
      <div className="grimoire-quickcast-label">Quick-Cast</div>
      <div className={inputClass}>
        {inputBuffer || <span style={{ opacity: 0.3 }}>_</span>}
        <span className="grimoire-quickcast-cursor" />
      </div>
      <div className="grimoire-quickcast-hint">
        {isInvalid
          ? 'Unknown shortcut — try again'
          : isMatch
          ? 'Press Enter or wait to cast'
          : isValidPfx && inputBuffer
          ? `Continue typing…`
          : 'Type shortcut (A–F, H–Z, AA… · G closes)'}
      </div>
    </div>
  );
}

// ─── Main GrimoireOverlay ─────────────────────────────────────────────────────

interface GrimoireOverlayProps {
  isOpen: boolean;
  isFlying: boolean;
  hasWeapon: boolean;
  isInvisible: boolean;
  inventory: CardInventory;
  loadout: ActiveCardLoadout;
  cooldowns: CardCooldownMap;
  onActivateCard: (id: AnyCardId) => boolean;
  onEquipCard: (id: AnyCardId, slot: ActiveCardSlotIndex) => void;
  onUnequipSlot: (slot: ActiveCardSlotIndex) => void;
  onUpgradeCard: (id: AnyCardId) => void;
  onClose: () => void;
}

/** Delay (ms) before a single-char shortcut that is ALSO a prefix resolves */
const AMBIGUOUS_RESOLVE_MS = 380;

function resolveCardDefinition(cardId: AnyCardId): CardDefinition<AnyCardId> {
  const found = CARD_DEFINITIONS.find((c) => c.id === cardId);
  if (found) return found;
  return {
    id: cardId,
    name: cardId
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    category: 'BOSS RELIC',
    rarity: 'Mythic',
    description: 'Rare boss-exclusive card obtained from a World Raid.',
    accentColor: '#c084fc',
    glowColor: '#fde047',
    maxLevel: DEFAULT_MAX_CARD_LEVEL,
    cooldownSeconds: 0,
    effectType: 'passive',
  };
}

export function GrimoireOverlay({
  isOpen,
  isFlying,
  hasWeapon,
  isInvisible,
  inventory,
  loadout,
  cooldowns,
  onActivateCard,
  onEquipCard,
  onUnequipSlot,
  onUpgradeCard,
  onClose,
}: GrimoireOverlayProps) {
  const ownedEntries = useMemo(() => Object.values(inventory.cards), [inventory]);
  const cards = useMemo(
    () => ownedEntries.map((e) => resolveCardDefinition(e.cardId)),
    [ownedEntries]
  );
  const totalCards = cards.length;

  const [currentSpread, setCurrentSpread] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<AnyCardId | null>(null);
  const [pageTurning, setPageTurning] = useState(false);
  const [confirmCard, setConfirmCard] = useState<string | null>(null);

  // Quick-cast state
  const [inputBuffer, setInputBuffer] = useState('');
  const [isInvalid, setIsInvalid] = useState(false);
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justOpenedRef = useRef(false);

  const totalSpreads = getTotalSpreads(totalCards);
  const spread = getSpreadLayout(currentSpread, totalCards);

  // Active map
  const activeMap: Record<string, boolean> = {
    flight: isFlying,
    weapon: hasWeapon,
    invisibility: isInvisible,
  };

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setCurrentSpread(0);
      setSelectedCardId(null);
      setInputBuffer('');
      setIsInvalid(false);
      setConfirmCard(null);
      justOpenedRef.current = true;
      // Prevent G keydown from landing in quick-cast
      const t = setTimeout(() => { justOpenedRef.current = false; }, 160);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Cleanup resolve timer on unmount
  useEffect(() => {
    return () => { if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current); };
  }, []);

  // ─── Shortcut helpers ──────────────────────────────────────────────────────

  const matchedCardIndex = useMemo(() => {
    if (!inputBuffer) return -1;
    const idx = shortcutToIndex(inputBuffer);
    if (idx >= 1 && idx <= totalCards) return idx - 1; // 0-based
    return -1;
  }, [inputBuffer, totalCards]);

  const isValidPfx = useMemo(() => {
    if (!inputBuffer) return false;
    return isValidPrefix(inputBuffer, totalCards);
  }, [inputBuffer, totalCards]);

  const isMatch = matchedCardIndex >= 0;

  // Navigate to the spread that contains a matched card
  const navigateToCard = useCallback((zeroBasedIdx: number) => {
    const targetSpread = Math.floor(zeroBasedIdx / 10);
    if (targetSpread !== currentSpread) {
      setPageTurning(true);
      setTimeout(() => {
        setCurrentSpread(targetSpread);
        setPageTurning(false);
      }, 400);
    }
  }, [currentSpread]);

  // Activate a card by its collection index (0-based)
  const activateByIndex = useCallback((zeroBasedIdx: number) => {
    if (zeroBasedIdx < 0 || zeroBasedIdx >= totalCards) return;
    const card = cards[zeroBasedIdx];
    if (!card) return;
    setConfirmCard(card.name);
    setSelectedCardId(card.id);
    setTimeout(() => {
      onActivateCard(card.id);
      onClose();
    }, 500);
  }, [cards, totalCards, onActivateCard, onClose]);

  // ─── Keyboard input handler ────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      // Skip G-key on immediate open
      if (justOpenedRef.current && e.code === 'KeyG') return;

      if (e.code === 'Escape') {
        if (inputBuffer) {
          setInputBuffer('');
          setIsInvalid(false);
          if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
        } else {
          onClose();
        }
        return;
      }

      if (e.code === 'Backspace') {
        setInputBuffer((prev) => prev.slice(0, -1));
        setIsInvalid(false);
        if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
        return;
      }

      // Enter = confirm match
      if (e.code === 'Enter') {
        if (isMatch) {
          if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
          activateByIndex(matchedCardIndex);
          setInputBuffer('');
        }
        return;
      }

      // Page navigation with arrow keys
      if (e.code === 'ArrowLeft' && !inputBuffer) {
        navigatePage(-1);
        return;
      }
      if (e.code === 'ArrowRight' && !inputBuffer) {
        navigatePage(1);
        return;
      }

      // G is reserved exclusively for opening/closing the Grimoire (handled by App)
      if (e.code === 'KeyG' || e.key.toUpperCase() === 'G') return;

      // Letter keys → build shortcut buffer
      const letter = e.key.toUpperCase();
      if (!/^[A-Z]$/.test(letter)) return;

      const nextBuffer = inputBuffer + letter;
      const nextIsExact = isExactMatch(nextBuffer, totalCards);
      const nextIsPrefix = isValidPrefix(nextBuffer, totalCards);

      if (!nextIsPrefix && !nextIsExact) {
        // Invalid
        setInputBuffer(nextBuffer);
        setIsInvalid(true);
        setTimeout(() => {
          setInputBuffer('');
          setIsInvalid(false);
        }, 500);
        return;
      }

      setInputBuffer(nextBuffer);
      setIsInvalid(false);

      // Scroll to card if it's a prefix match
      const idx = shortcutToIndex(nextBuffer);
      if (idx >= 1 && idx <= totalCards) {
        navigateToCard(idx - 1);
      }

      // Clear any existing timer
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);

      if (nextIsExact) {
        // Check if nextBuffer is ALSO a prefix for something longer
        const isAlsoPrefix = isValidPrefix(nextBuffer + 'A', totalCards) ||
          isValidPrefix(nextBuffer + 'B', totalCards);

        if (isAlsoPrefix) {
          // Ambiguous — wait for more input or timeout
          resolveTimerRef.current = setTimeout(() => {
            const finalIdx = shortcutToIndex(nextBuffer);
            if (finalIdx >= 1 && finalIdx <= totalCards) {
              activateByIndex(finalIdx - 1);
              setInputBuffer('');
            }
          }, AMBIGUOUS_RESOLVE_MS);
        } else {
          // Unambiguous exact match — activate immediately
          activateByIndex(idx - 1);
          setInputBuffer('');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, inputBuffer, isMatch, matchedCardIndex, activateByIndex, navigateToCard, totalCards]);

  // ─── Page Navigation ──────────────────────────────────────────────────────

  const navigatePage = useCallback((dir: -1 | 1) => {
    const next = currentSpread + dir;
    if (next < 0 || next >= totalSpreads) return;
    setPageTurning(true);
    setTimeout(() => {
      setCurrentSpread(next);
      setPageTurning(false);
    }, 400);
  }, [currentSpread, totalSpreads]);

  // Card click handler
  // Activate from card click or inspection panel and close Grimoire
  const handleActivate = useCallback((id: AnyCardId) => {
    if (!canActivateCard(id, loadout, cooldowns).allowed) return;
    const idx = cards.findIndex((c) => c.id === id);
    setConfirmCard(cards[idx]?.name ?? '');
    setSelectedCardId(id);
    onActivateCard(id);
    setTimeout(() => {
      onClose();
    }, 180);
  }, [cards, loadout, cooldowns, onActivateCard, onClose]);

  const handleCardSelect = useCallback((id: AnyCardId) => {
    const isMobileViewport =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 960);

    // On mobile, tapping an equipped, ready card immediately activates it and closes the Grimoire
    if (isMobileViewport && canActivateCard(id, loadout, cooldowns).allowed) {
      handleActivate(id);
      return;
    }

    setSelectedCardId((prev) => (prev === id ? null : id));
  }, [loadout, cooldowns, handleActivate]);

  if (!isOpen) return null;

  const selectedCard = selectedCardId ? cards.find((c) => c.id === selectedCardId) ?? null : null;
  const selectedEntry = selectedCard ? inventory.cards[selectedCard.id] ?? null : null;
  const selectedCardIndex = selectedCard ? cards.indexOf(selectedCard) : -1;

  // Build page columns
  function renderCardSlots(indices: number[]) {
    return indices.map((ci, slotIdx) => {
      if (ci === -1) return <EmptySlot key={`empty-${slotIdx}`} />;
      const card = cards[ci];
      const entry = card ? inventory.cards[card.id] : undefined;
      if (!card || !entry) return <EmptySlot key={`missing-${slotIdx}`} />;
      const isMatch = matchedCardIndex === ci;
      return (
        <GrimoireCardItem
          key={card.id}
          card={card}
          entry={entry}
          equippedSlot={loadout.slots.indexOf(card.id)}
          cooldownSec={cooldowns[card.id] ?? 0}
          cardIndex={ci}
          totalCards={totalCards}
          isActive={activeMap[card.id] ?? false}
          isSelected={selectedCardId === card.id}
          isShortcutMatch={isMatch}
          onSelect={handleCardSelect}
        />
      );
    });
  }

  return (
    <div
      className="grimoire-overlay"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Confirmation flash */}
      {confirmCard && (
        <div className="grimoire-confirm-flash" key={confirmCard}>
          <div className="grimoire-confirm-text">✦ {confirmCard.toUpperCase()} ✦</div>
        </div>
      )}

      <div className="grimoire-book-container">
        {/* Close button */}
        <button
          type="button"
          className="grimoire-close-btn"
          onClick={onClose}
        >
          ✕ Close Grimoire [G / Esc]
        </button>

        {/* Active 4-Slot Loadout Bar (clearly separated from owned card inventory) */}
        <div className="grimoire-active-loadout-bar">
          <div className="grimoire-active-loadout-title">ACTIVE DECK SLOTS (1–4)</div>
          <div className="grimoire-active-loadout-grid">
            {loadout.slots.map((slotCardId, idx) => {
              const slotDef = slotCardId
                ? CARD_DEFINITIONS.find((c) => c.id === slotCardId)
                : undefined;
              const slotEntry = slotCardId ? inventory.cards[slotCardId] : undefined;
              const slotCd = slotCardId ? cooldowns[slotCardId] ?? 0 : 0;
              const slotActive = slotCardId ? activeMap[slotCardId] ?? false : false;
              return (
                <div
                  key={idx}
                  className={`grimoire-loadout-chip ${slotActive ? 'is-active' : ''}`}
                  style={{
                    borderColor: slotActive
                      ? '#22c55e'
                      : slotDef
                        ? getComputedRarityAccent(slotDef.rarity)
                        : 'rgba(148, 163, 184, 0.22)',
                  }}
                >
                  <button
                    type="button"
                    disabled={!slotCardId}
                    onClick={() => {
                      if (!slotCardId) return;
                      if (canActivateCard(slotCardId, loadout, cooldowns).allowed) {
                        handleActivate(slotCardId);
                      } else {
                        setSelectedCardId(slotCardId);
                      }
                    }}
                    className="grimoire-loadout-chip-main"
                  >
                    <span className="grimoire-loadout-slot-num">SLOT {idx + 1}</span>
                    <span className="grimoire-loadout-slot-name">
                      {slotDef ? slotDef.name : 'Empty'}
                    </span>
                    <span className="grimoire-loadout-slot-meta">
                      {slotEntry
                        ? slotCd > 0
                          ? `CD ${Math.ceil(slotCd)}s`
                          : `Lv.${slotEntry.level}`
                        : 'Tap card below to equip'}
                    </span>
                  </button>
                  {slotCardId && (
                    <button
                      type="button"
                      aria-label={`Unequip slot ${idx + 1}`}
                      onClick={() => onUnequipSlot(idx as ActiveCardSlotIndex)}
                      className="grimoire-loadout-unequip"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* THE BOOK */}
        <div className={`grimoire-book ${pageTurning ? 'grimoire-page-turn-anim' : ''}`}>
          {/* ── SPINE ── */}
          <div className="grimoire-spine">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="grimoire-spine-band" />
            ))}
          </div>

          {/* ── LEFT PAGE ── */}
          <div className="grimoire-page grimoire-page-left">
            <div className="grimoire-page-inner">
              <div className="grimoire-page-header">
                <div className="grimoire-page-title">Spells & Abilities</div>
                <div className="grimoire-page-number">
                  Spread {currentSpread + 1} of {totalSpreads}
                </div>
              </div>
              <div className="grimoire-ornament">— ✦ —</div>
              <div className="grimoire-page-divider" />

              {totalCards === 0 ? (
                <div
                  style={{
                    padding: '24px 12px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  Your Grimoire inventory is empty. Defeat Raid Bosses on the island to collect cards.
                </div>
              ) : (
                <div className="grimoire-card-grid">
                  {renderCardSlots(spread.leftCards)}
                </div>
              )}

              <div className="grimoire-page-divider" style={{ marginTop: 'auto' }} />
              <div
                className="grimoire-page-number"
                style={{ textAlign: 'left', marginTop: 2 }}
              >
                Cards {spread.startCardIndex + 1}–
                {Math.min(spread.startCardIndex + 5, totalCards)} of {totalCards}
              </div>
            </div>
          </div>

          {/* ── RIGHT PAGE ── */}
          <div className="grimoire-page grimoire-page-right">
            <div className="grimoire-page-inner">
              <div className="grimoire-page-header">
                <div className="grimoire-page-title">Collected Grimoire</div>
                <div className="grimoire-page-number">
                  {spread.endCardIndex > spread.startCardIndex + 5
                    ? `Cards ${spread.startCardIndex + 6}–${spread.endCardIndex} of ${totalCards}`
                    : '—'}
                </div>
              </div>
              <div className="grimoire-ornament">— ✦ —</div>
              <div className="grimoire-page-divider" />

              <div className="grimoire-card-grid">
                {renderCardSlots(spread.rightCards)}
              </div>

              <div className="grimoire-page-divider" style={{ marginTop: 'auto' }} />
              <div
                className="grimoire-page-number"
                style={{ textAlign: 'right', marginTop: 2 }}
              >
                Greed Island · Arcane Registry
              </div>
            </div>
          </div>
        </div>

        {/* ── INSPECTION PANEL (right side) ── */}
        {selectedCard && selectedEntry && (
          <InspectionPanel
            key={selectedCard.id}
            card={selectedCard}
            entry={selectedEntry}
            loadout={loadout}
            cooldownSec={cooldowns[selectedCard.id] ?? 0}
            cardIndex={selectedCardIndex}
            isActive={activeMap[selectedCard.id] ?? false}
            onActivate={handleActivate}
            onEquip={onEquipCard}
            onUnequipSlot={onUnequipSlot}
            onUpgrade={onUpgradeCard}
          />
        )}

        {/* ── PAGE NAVIGATION ── */}
        <div className="grimoire-nav">
          <button
            type="button"
            className="grimoire-nav-btn"
            onClick={() => navigatePage(-1)}
            disabled={currentSpread === 0}
            aria-label="Previous spread"
          >
            ◀
          </button>

          <div className="grimoire-nav-label">
            {Array.from({ length: totalSpreads }, (_, i) => (
              <span
                key={i}
                onClick={() => {
                  if (i !== currentSpread) {
                    setPageTurning(true);
                    setTimeout(() => { setCurrentSpread(i); setPageTurning(false); }, 400);
                  }
                }}
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  margin: '0 3px',
                  cursor: 'pointer',
                  background: i === currentSpread
                    ? 'rgba(212,176,96,0.9)'
                    : 'rgba(212,176,96,0.25)',
                  border: '1px solid rgba(212,176,96,0.4)',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            className="grimoire-nav-btn"
            onClick={() => navigatePage(1)}
            disabled={currentSpread >= totalSpreads - 1}
            aria-label="Next spread"
          >
            ▶
          </button>
        </div>

        {/* ── QUICK-CAST DISPLAY ── */}
        <QuickCastDisplay
          inputBuffer={inputBuffer}
          isValidPfx={isValidPfx}
          isMatch={isMatch}
          isInvalid={isInvalid}
          totalCards={totalCards}
        />
      </div>
    </div>
  );
}
