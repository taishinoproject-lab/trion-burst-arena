import { useEffect, useRef, useState } from 'react';

interface MobileControlsProps {
  onMove: (x: number, y: number) => void;
  onAttack: (pressed: boolean) => void;
  onCycleBullet: () => void;
  onShield: () => void;
  onWideShield: () => void;
  visible: boolean;
}

export const MobileControls = ({
  onMove,
  onAttack,
  onCycleBullet,
  onShield,
  onWideShield,
  visible,
}: MobileControlsProps) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const [isAttacking, setIsAttacking] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const joystick = joystickRef.current;
    const knob = knobRef.current;
    if (!joystick || !knob) return;

    const joystickRadius = 44;

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
      
      // Normalize to -1 to 1
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
  }, [visible, onMove]);

  const handleAttackStart = () => {
    setIsAttacking(true);
    onAttack(true);
  };

  const handleAttackEnd = () => {
    setIsAttacking(false);
    onAttack(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {/* Left side - Joystick */}
      <div
        className="absolute left-3 pointer-events-auto"
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div
          ref={joystickRef}
          className="relative w-28 h-28 rounded-full border-2 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(0, 255, 213, 0.1) 0%, rgba(10, 10, 18, 0.9) 100%)',
            borderColor: 'rgba(0, 255, 213, 0.4)',
            boxShadow: '0 0 20px rgba(0, 255, 213, 0.2), inset 0 0 30px rgba(0, 255, 213, 0.05)',
          }}
        >
          {/* Joystick knob */}
          <div
            ref={knobRef}
            className="w-12 h-12 rounded-full transition-transform duration-75"
            style={{
              background: 'linear-gradient(135deg, rgba(0, 255, 213, 0.6) 0%, rgba(0, 180, 150, 0.8) 100%)',
              boxShadow: '0 0 15px rgba(0, 255, 213, 0.5), 0 2px 8px rgba(0, 0, 0, 0.5)',
              border: '2px solid rgba(0, 255, 213, 0.8)',
            }}
          />
          {/* Direction indicators */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="absolute top-2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px]" style={{ borderBottomColor: 'rgba(0, 255, 213, 0.3)' }} />
            <div className="absolute bottom-2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px]" style={{ borderTopColor: 'rgba(0, 255, 213, 0.3)' }} />
            <div className="absolute left-2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px]" style={{ borderRightColor: 'rgba(0, 255, 213, 0.3)' }} />
            <div className="absolute right-2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px]" style={{ borderLeftColor: 'rgba(0, 255, 213, 0.3)' }} />
          </div>
        </div>
        {/* Label */}
        <div className="text-center mt-2 text-xs font-mono tracking-wider" style={{ color: 'rgba(0, 255, 213, 0.6)' }}>
          MOVE
        </div>
      </div>

      {/* Right side - Action buttons */}
      <div
        className="absolute right-3 pointer-events-auto"
        style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-2 gap-3">
          {/* Attack Button - Large, prominent */}
          <button
            onTouchStart={handleAttackStart}
            onTouchEnd={handleAttackEnd}
            onTouchCancel={handleAttackEnd}
            className="col-span-1 row-span-2 w-[68px] h-[92px] rounded-lg font-mono text-[10px] font-bold tracking-wide transition-all duration-100 flex flex-col items-center justify-center gap-1"
            style={{
              background: isAttacking 
                ? 'linear-gradient(135deg, rgba(0, 255, 213, 0.8) 0%, rgba(0, 180, 150, 0.9) 100%)'
                : 'linear-gradient(135deg, rgba(0, 255, 213, 0.15) 0%, rgba(10, 10, 18, 0.95) 100%)',
              border: '2px solid rgba(0, 255, 213, 0.6)',
              boxShadow: isAttacking 
                ? '0 0 25px rgba(0, 255, 213, 0.6), inset 0 0 20px rgba(0, 255, 213, 0.3)'
                : '0 0 15px rgba(0, 255, 213, 0.2)',
              color: isAttacking ? '#0a0a12' : '#00ffd5',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
            <span>FIRE</span>
          </button>

          {/* Cycle Bullet Type */}
          <button
            onTouchStart={(e) => { e.preventDefault(); onCycleBullet(); }}
            className="w-14 h-11 rounded-lg font-mono text-[9px] font-bold tracking-wide transition-all duration-100 flex flex-col items-center justify-center gap-0.5 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 200, 100, 0.15) 0%, rgba(10, 10, 18, 0.95) 100%)',
              border: '2px solid rgba(255, 200, 100, 0.5)',
              boxShadow: '0 0 10px rgba(255, 200, 100, 0.15)',
              color: '#ffc864',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span>TYPE</span>
          </button>

          {/* Shield */}
          <button
            onTouchStart={(e) => { e.preventDefault(); onShield(); }}
            className="w-14 h-11 rounded-lg font-mono text-[9px] font-bold tracking-wide transition-all duration-100 flex flex-col items-center justify-center gap-0.5 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, rgba(0, 200, 255, 0.15) 0%, rgba(10, 10, 18, 0.95) 100%)',
              border: '2px solid rgba(0, 200, 255, 0.5)',
              boxShadow: '0 0 10px rgba(0, 200, 255, 0.15)',
              color: '#00c8ff',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>SHIELD</span>
          </button>

          {/* Wide Shield */}
          <button
            onTouchStart={(e) => { e.preventDefault(); onWideShield(); }}
            className="col-span-2 w-full h-11 rounded-lg font-mono text-[9px] font-bold tracking-wide transition-all duration-100 flex items-center justify-center gap-2 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, rgba(180, 100, 255, 0.15) 0%, rgba(10, 10, 18, 0.95) 100%)',
              border: '2px solid rgba(180, 100, 255, 0.5)',
              boxShadow: '0 0 10px rgba(180, 100, 255, 0.15)',
              color: '#b464ff',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <circle cx="12" cy="11" r="4" />
            </svg>
            <span>WIDE SHIELD</span>
          </button>
        </div>
      </div>
    </div>
  );
};
