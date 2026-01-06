import { useEffect, useRef, useState } from 'react';

type PlayerId = 'p1' | 'p2';

interface MobilePvpControlsProps {
  visible: boolean;
  onMove: (player: PlayerId, x: number, y: number) => void;
  onAttack: (player: PlayerId, pressed: boolean) => void;
  onShield: (player: PlayerId, wide: boolean) => void;
  onCycleBullet: (player: PlayerId) => void;
}

interface JoystickProps {
  label: string;
  accent: string;
  onMove: (x: number, y: number) => void;
  labelRotateDegrees?: number;
}

const Joystick = ({ label, accent, onMove, labelRotateDegrees = 0 }: JoystickProps) => {
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

      knob.style.transform = `translate(${dx}px, ${dy}px)`;
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
        <span
          className="inline-block"
          style={{ transform: labelRotateDegrees ? `rotate(${labelRotateDegrees}deg)` : undefined }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};

const ActionButton = ({
  label,
  accent,
  pressed,
  rotateDegrees = 0,
  onTouchStart,
  onTouchEnd,
}: {
  label: string;
  accent: string;
  pressed?: boolean;
  rotateDegrees?: number;
  onTouchStart: () => void;
  onTouchEnd?: () => void;
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
    className="w-[72px] h-[72px] rounded-xl font-mono text-[11px] font-bold tracking-wide transition-all duration-100 flex items-center justify-center active:scale-95"
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
    <span
      className="inline-block"
      style={{ transform: rotateDegrees ? `rotate(${rotateDegrees}deg)` : undefined }}
    >
      {label}
    </span>
  </button>
);

export const MobilePvpControls = ({
  visible,
  onMove,
  onAttack,
  onShield,
  onCycleBullet,
}: MobilePvpControlsProps) => {
  const [p1Attacking, setP1Attacking] = useState(false);
  const [p2Attacking, setP2Attacking] = useState(false);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-[70]">
      <div
        className="absolute pointer-events-auto flex flex-col justify-between"
        style={{
          left: 'calc(0.5rem + env(safe-area-inset-left))',
          top: 'calc(0.75rem + env(safe-area-inset-top))',
          bottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <Joystick
            label="P1 移動"
            accent="#00ffd5"
            onMove={(x, y) => onMove('p1', x, y)}
            labelRotateDegrees={-90}
          />
        </div>
        <div className="flex flex-col items-center gap-3">
          <ActionButton
            label="射撃"
            accent="#00ffd5"
            rotateDegrees={180}
            pressed={p1Attacking}
            onTouchStart={() => {
              setP1Attacking(true);
              onAttack('p1', true);
            }}
            onTouchEnd={() => {
              setP1Attacking(false);
              onAttack('p1', false);
            }}
          />
          <ActionButton
            label="シールド"
            accent="#4ad6ff"
            rotateDegrees={180}
            onTouchStart={() => onShield('p1', false)}
          />
          <ActionButton
            label="広域"
            accent="#b464ff"
            rotateDegrees={180}
            onTouchStart={() => onShield('p1', true)}
          />
          <ActionButton
            label="切替"
            accent="#ffc864"
            rotateDegrees={180}
            onTouchStart={() => onCycleBullet('p1')}
          />
        </div>
      </div>

      <div
        className="absolute pointer-events-auto flex flex-col justify-between"
        style={{
          right: 'calc(0.5rem + env(safe-area-inset-right))',
          top: 'calc(0.75rem + env(safe-area-inset-top))',
          bottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <ActionButton
            label="射撃"
            accent="#ff6b6b"
            rotateDegrees={180}
            pressed={p2Attacking}
            onTouchStart={() => {
              setP2Attacking(true);
              onAttack('p2', true);
            }}
            onTouchEnd={() => {
              setP2Attacking(false);
              onAttack('p2', false);
            }}
          />
          <ActionButton
            label="シールド"
            accent="#ff9aa2"
            rotateDegrees={180}
            onTouchStart={() => onShield('p2', false)}
          />
          <ActionButton
            label="広域"
            accent="#ff7ab6"
            rotateDegrees={180}
            onTouchStart={() => onShield('p2', true)}
          />
          <ActionButton
            label="切替"
            accent="#ffd166"
            rotateDegrees={180}
            onTouchStart={() => onCycleBullet('p2')}
          />
        </div>
        <div className="flex flex-col items-center gap-4">
          <Joystick
            label="P2 移動"
            accent="#ff6b6b"
            onMove={(x, y) => onMove('p2', x, y)}
            labelRotateDegrees={90}
          />
        </div>
      </div>
    </div>
  );
};
