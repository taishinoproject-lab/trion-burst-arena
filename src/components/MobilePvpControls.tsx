import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BulletType } from '../game/constants';

type PlayerId = 'p1' | 'p2';

interface MobilePvpControlsProps {
  visible: boolean;
  onMove: (player: PlayerId, x: number, y: number) => void;
  onAttack: (player: PlayerId, pressed: boolean) => void;
  onShield: (player: PlayerId, wide: boolean) => void;
  onCycleBullet: (player: PlayerId) => void;
  onDelayToggle: (player: PlayerId) => void;
  currentBulletType?: { p1?: BulletType | null; p2?: BulletType | null };
  trionStatus?: { p1: number; p2: number; max: number };
}

interface JoystickProps {
  label: string;
  accent: string;
  onMove: (x: number, y: number) => void;
  displayRotation?: number;
}

const getBulletDisplayName = (type?: BulletType | null) => {
  switch (type) {
    case 'asteroid':
      return 'アステロイド';
    case 'meteora':
      return 'メテオラ';
    case 'viper':
      return 'バイパー';
    case 'red':
      return 'レッドバレット';
    case 'hound':
      return 'ハウンド';
    default:
      return '未装備';
  }
};

const Joystick = ({ label, accent, onMove, displayRotation = 0 }: JoystickProps) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const activeTouchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const joystick = joystickRef.current;
    const knob = knobRef.current;
    if (!joystick || !knob) return;

    const joystickRadius = 48;

    const handleStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      if (!touch) return;
      isDraggingRef.current = true;
      activeTouchIdRef.current = touch.identifier;
      handleMove(touch.clientX, touch.clientY);
    };

    const handleMove = (clientX: number, clientY: number) => {
      const rect = joystick.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const clampedX = Math.min(Math.max(clientX, rect.left), rect.right);
      const clampedY = Math.min(Math.max(clientY, rect.top), rect.bottom);
      let dx = clampedX - centerX;
      let dy = clampedY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > joystickRadius) {
        dx = (dx / distance) * joystickRadius;
        dy = (dy / distance) * joystickRadius;
      }

      const rotationRadians = (displayRotation * Math.PI) / 180;
      const rotatedX = dx * Math.cos(rotationRadians) - dy * Math.sin(rotationRadians);
      const rotatedY = dx * Math.sin(rotationRadians) + dy * Math.cos(rotationRadians);
      knob.style.transform = `translate(${rotatedX}px, ${rotatedY}px)`;
      onMove(dx / joystickRadius, dy / joystickRadius);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || activeTouchIdRef.current === null) return;
      e.preventDefault();
      const touch = Array.from(e.touches).find(
        (item) => item.identifier === activeTouchIdRef.current,
      );
      if (!touch) return;
      handleMove(touch.clientX, touch.clientY);
    };

    const handleEnd = (e: TouchEvent) => {
      if (activeTouchIdRef.current === null) return;
      const ended = Array.from(e.changedTouches).some(
        (item) => item.identifier === activeTouchIdRef.current,
      );
      if (!ended) return;
      isDraggingRef.current = false;
      activeTouchIdRef.current = null;
      knob.style.transform = 'translate(0px, 0px)';
      onMove(0, 0);
    };

    joystick.addEventListener('touchstart', handleStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
    document.addEventListener('touchcancel', handleEnd);

    return () => {
      joystick.removeEventListener('touchstart', handleStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
      document.removeEventListener('touchcancel', handleEnd);
    };
  }, [onMove]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={joystickRef}
        className="relative w-28 h-28 rounded-full border-2 flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${accent}22 0%, rgba(10, 10, 18, 0.9) 100%)`,
          borderColor: `${accent}66`,
          boxShadow: `0 0 18px ${accent}55, inset 0 0 24px ${accent}22`,
        }}
      >
        <div
          ref={knobRef}
          className="w-12 h-12 rounded-full transition-transform duration-75"
          style={{
            background: `linear-gradient(135deg, ${accent}cc 0%, ${accent}88 100%)`,
            boxShadow: `0 0 12px ${accent}aa, 0 2px 6px rgba(0, 0, 0, 0.5)`,
            border: `2px solid ${accent}`,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="absolute top-2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px]"
            style={{ borderBottomColor: `${accent}66` }}
          />
          <div
            className="absolute bottom-2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px]"
            style={{ borderTopColor: `${accent}66` }}
          />
          <div
            className="absolute left-2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px]"
            style={{ borderRightColor: `${accent}66` }}
          />
          <div
            className="absolute right-2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px]"
            style={{ borderLeftColor: `${accent}66` }}
          />
        </div>
      </div>
      <div
        className="text-center text-[12px] font-mono tracking-wider"
        style={{ color: `${accent}aa` }}
      >
        <span className="inline-block">{label}</span>
      </div>
    </div>
  );
};

const ActionButton = ({
  label,
  accent,
  pressed,
  onTouchStart,
  onTouchEnd,
  className,
  children,
  contentClassName,
}: {
  label: string;
  accent: string;
  pressed?: boolean;
  onTouchStart: () => void;
  onTouchEnd?: () => void;
  className?: string;
  children?: ReactNode;
  contentClassName?: string;
}) => (
  <button
    onTouchStart={(event) => {
      event.preventDefault();
      onTouchStart();
    }}
    onTouchEnd={(event) => {
      event.preventDefault();
      onTouchEnd?.();
    }}
    onTouchCancel={(event) => {
      event.preventDefault();
      onTouchEnd?.();
    }}
    className={`rounded-xl font-mono text-[11px] font-bold tracking-wide transition-all duration-100 flex items-center justify-center active:scale-95 ${className ?? ''}`}
    style={{
      background: pressed
        ? `linear-gradient(135deg, ${accent}cc 0%, ${accent}ee 100%)`
        : `linear-gradient(135deg, ${accent}33 0%, rgba(10, 10, 18, 0.92) 100%)`,
      border: `2px solid ${accent}88`,
      boxShadow: pressed ? `0 0 18px ${accent}aa` : `0 0 12px ${accent}44`,
      color: pressed ? '#0a0a12' : accent,
    }}
    type="button"
  >
    <span className={`flex flex-col items-center justify-center gap-1 ${contentClassName ?? ''}`}>
      {children}
      <span>{label}</span>
    </span>
  </button>
);

const TrionMeter = ({
  label,
  accent,
  value,
  max,
  bulletLabel,
  className,
}: {
  label: string;
  accent: string;
  value: number;
  max: number;
  bulletLabel?: string;
  className?: string;
}) => {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={`flex flex-col items-center gap-1 ${className ?? ''}`}>
      {bulletLabel && (
        <div className="text-[10px] font-mono tracking-wider" style={{ color: `${accent}aa` }}>
          {bulletLabel}
        </div>
      )}
      <div className="text-[11px] font-mono tracking-wider" style={{ color: `${accent}cc` }}>
        {label}
      </div>
      <div
        className="relative overflow-hidden rounded-full border-2"
        style={{
          width: 'clamp(220px, 30vw, 280px)',
          height: '24px',
          borderColor: `${accent}aa`,
          background: 'rgba(20, 20, 35, 0.85)',
          boxShadow: `0 0 12px ${accent}55`,
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${ratio * 100}%`,
            background: `linear-gradient(90deg, ${accent} 0%, ${accent}cc 100%)`,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-white/80">
          {Math.round(value)}/{max}
        </div>
      </div>
    </div>
  );
};

export const MobilePvpControls = ({
  visible,
  onMove,
  onAttack,
  onShield,
  onCycleBullet,
  onDelayToggle,
  currentBulletType,
  trionStatus,
}: MobilePvpControlsProps) => {
  const [p1Attacking, setP1Attacking] = useState(false);
  const [p2Attacking, setP2Attacking] = useState(false);

  if (!visible) return null;

  const p1DelayLabel = currentBulletType?.p1 === 'viper' ? '弾道切替' : '遅延';
  const p2DelayLabel = currentBulletType?.p2 === 'viper' ? '弾道切替' : '遅延';
  const trionMax = trionStatus?.max ?? 1;
  const p1BulletLabel = `P1 弾: ${getBulletDisplayName(currentBulletType?.p1)}`;
  const p2BulletLabel = `P2 弾: ${getBulletDisplayName(currentBulletType?.p2)}`;

  return (
    <div className="absolute inset-0 pointer-events-none z-[70]">
      <div
        className="absolute pointer-events-none"
        style={{
          left: 'calc(3rem + env(safe-area-inset-left)t',
          top: '75%',
          transform: 'rotate(-90deg)',
          transformOrigin: 'center',
        }}
      >
        <TrionMeter
          label="P1 トリオン"
          accent="#00ffd5"
          value={trionStatus?.p1 ?? trionMax}
          max={trionMax}
          bulletLabel={p1BulletLabel}
          className="rotate-180"
        />
      </div>
      <div
        className="absolute pointer-events-auto"
        style={{
          left: 'calc(0.5rem + env(safe-area-inset-left))',
          top: '55%',
          transform: 'translateY(-50%) rotate(-90deg)',
          transformOrigin: 'center',
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-6">
            <div className="grid grid-cols-2 gap-3">
              <ActionButton
                label="射撃"
                accent="#00ffd5"
                pressed={p1Attacking}
                className="col-span-1 row-span-2 w-[84px] h-[112px]"
                contentClassName="rotate-180"
                onTouchStart={() => {
                  setP1Attacking(true);
                  onAttack('p1', true);
                }}
                onTouchEnd={() => {
                  setP1Attacking(false);
                  onAttack('p1', false);
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <line x1="12" y1="2" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                </svg>
              </ActionButton>
              <ActionButton
                label="切替"
                accent="#ffc864"
                className="w-16 h-12 text-[10px]"
                contentClassName="rotate-180"
                onTouchStart={() => onCycleBullet('p1')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
              </ActionButton>
              <ActionButton
                label="シールド"
                accent="#4ad6ff"
                className="w-16 h-12 text-[10px]"
                contentClassName="rotate-180"
                onTouchStart={() => onShield('p1', false)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </ActionButton>
              <ActionButton
                label={p1DelayLabel}
                accent="#00ffd5"
                className="col-span-2 h-12 text-[10px]"
                contentClassName="rotate-180"
                onTouchStart={() => onDelayToggle('p1')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
              </ActionButton>
              <ActionButton
                label="広域シールド"
                accent="#b464ff"
                className="col-span-2 h-12 text-[10px]"
                contentClassName="rotate-180"
                onTouchStart={() => onShield('p1', true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <circle cx="12" cy="11" r="4" />
                </svg>
              </ActionButton>
            </div>
            <Joystick
              label="P1 移動"
              accent="#00ffd5"
              displayRotation={90}
              onMove={(x, y) => onMove('p1', x, y)}
            />
          </div>
        </div>
      </div>

      <div
        className="absolute pointer-events-none"
        style={{
          right: 'calc(3rem + env(safe-area-inset-right)t',
          top: '25%',
          transform: 'rotate(90deg)',
          transformOrigin: 'center',
        }}
      >
        <TrionMeter
          label="P2 トリオン"
          accent="#ff6b6b"
          value={trionStatus?.p2 ?? trionMax}
          max={trionMax}
          bulletLabel={p2BulletLabel}
          className="rotate-180"
        />
      </div>
      <div
        className="absolute pointer-events-auto"
        style={{
          right: 'calc(0.5rem + env(safe-area-inset-right))',
          top: '55%',
          transform: 'translateY(-50%) rotate(90deg)',
          transformOrigin: 'center',
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-6">
            <div className="grid grid-cols-2 gap-3">
              <ActionButton
                label="射撃"
                accent="#ff6b6b"
                pressed={p2Attacking}
                className="col-span-1 row-span-2 w-[84px] h-[112px]"
                contentClassName="rotate-180"
                onTouchStart={() => {
                  setP2Attacking(true);
                  onAttack('p2', true);
                }}
                onTouchEnd={() => {
                  setP2Attacking(false);
                  onAttack('p2', false);
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <line x1="12" y1="2" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                </svg>
              </ActionButton>
              <ActionButton
                label="切替"
                accent="#ffc864"
                className="w-16 h-12 text-[10px]"
                contentClassName="rotate-180"
                onTouchStart={() => onCycleBullet('p2')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
              </ActionButton>
              <ActionButton
                label="シールド"
                accent="#4ad6ff"
                className="w-16 h-12 text-[10px]"
                contentClassName="rotate-180"
                onTouchStart={() => onShield('p2', false)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </ActionButton>
              <ActionButton
                label={p2DelayLabel}
                accent="#00ffd5"
                className="col-span-2 h-12 text-[10px]"
                contentClassName="rotate-180"
                onTouchStart={() => onDelayToggle('p2')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
              </ActionButton>
              <ActionButton
                label="広域シールド"
                accent="#b464ff"
                className="col-span-2 h-12 text-[10px]"
                contentClassName="rotate-180"
                onTouchStart={() => onShield('p2', true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <circle cx="12" cy="11" r="4" />
                </svg>
              </ActionButton>
            </div>
            <Joystick
              label="P2 移動"
              accent="#ff6b6b"
              displayRotation={-90}
              onMove={(x, y) => onMove('p2', x, y)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
