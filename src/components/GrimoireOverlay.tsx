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
import { CARD_DEFINITIONS, CardDefinition, CardId } from '../types/game';
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
  card: CardDefinition;
  cardIndex: number; // 0-based
  totalCards: number;
  isActive: boolean;
  isSelected: boolean;
  isShortcutMatch: boolean;
  onSelect: (id: CardId) => void;
}

const GrimoireCardItem = React.memo(function GrimoireCardItem({
  card,
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
            <CardArtCanvas card={card} isActive={isActive} size={160} />
          </div>

          {/* Rarity divider */}
          <div className="grimoire-card-rarity-stripe" />

          {/* Info */}
          <div className="grimoire-card-info">
            <div className="grimoire-card-name">{card.name}</div>
            <div className="grimoire-card-category">{card.category}</div>
            <div className="grimoire-card-rarity-badge">{rarityLabel(card.rarity)}</div>
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
  card: CardDefinition;
  cardIndex: number;
  isActive: boolean;
  onActivate: (id: CardId) => void;
}

function InspectionPanel({ card, cardIndex, isActive, onActivate }: InspectionPanelProps) {
  const shortcut = indexToShortcut(cardIndex + 1);

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
        <CardArtCanvas card={card} isActive={isActive} size={320} />
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
            style={{ color: isActive ? '#4ade80' : '#94a3b8' }}
          >
            {isActive ? '● Active' : '○ Inactive'}
          </span>
        </div>

        <div className="grimoire-inspection-desc">{card.description}</div>

        <button
          type="button"
          className={`grimoire-cast-btn ${isActive ? 'active-state' : ''} ${rarityClass(card.rarity)}`}
          onClick={() => onActivate(card.id)}
        >
          {isActive ? '✦ DEACTIVATE' : '✦ CAST SPELL'}
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
          : 'Type card shortcut (A, B, … AA, AB…)'}
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
  onActivateCard: (id: CardId) => void;
  onClose: () => void;
}

/** Delay (ms) before a single-char shortcut that is ALSO a prefix resolves */
const AMBIGUOUS_RESOLVE_MS = 380;

export function GrimoireOverlay({
  isOpen,
  isFlying,
  hasWeapon,
  isInvisible,
  onActivateCard,
  onClose,
}: GrimoireOverlayProps) {
  const cards = CARD_DEFINITIONS;
  const totalCards = cards.length;

  const [currentSpread, setCurrentSpread] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<CardId | null>(null);
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
  const activeMap: Record<CardId, boolean> = {
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
  const handleCardSelect = useCallback((id: CardId) => {
    setSelectedCardId((prev) => (prev === id ? null : id));
  }, []);

  // Activate from inspection panel
  const handleActivate = useCallback((id: CardId) => {
    const idx = cards.findIndex((c) => c.id === id);
    setConfirmCard(cards[idx]?.name ?? '');
    setSelectedCardId(id);
    setTimeout(() => {
      onActivateCard(id);
      onClose();
    }, 500);
  }, [cards, onActivateCard, onClose]);

  if (!isOpen) return null;

  const selectedCard = selectedCardId ? cards.find((c) => c.id === selectedCardId) ?? null : null;
  const selectedCardIndex = selectedCard ? cards.indexOf(selectedCard) : -1;

  // Build page columns
  function renderCardSlots(indices: number[]) {
    return indices.map((ci, slotIdx) => {
      if (ci === -1) return <EmptySlot key={`empty-${slotIdx}`} />;
      const card = cards[ci];
      if (!card) return <EmptySlot key={`missing-${slotIdx}`} />;
      const isMatch = matchedCardIndex === ci;
      return (
        <GrimoireCardItem
          key={card.id}
          card={card}
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
    <div className="grimoire-overlay" onMouseDown={(e) => e.stopPropagation()}>
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
          style={{ position: 'absolute', top: -40, right: 0 }}
        >
          ✕ Close Grimoire [Esc]
        </button>

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

              <div className="grimoire-card-grid">
                {renderCardSlots(spread.leftCards)}
              </div>

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
        {selectedCard && (
          <InspectionPanel
            key={selectedCard.id}
            card={selectedCard}
            cardIndex={selectedCardIndex}
            isActive={activeMap[selectedCard.id] ?? false}
            onActivate={handleActivate}
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
