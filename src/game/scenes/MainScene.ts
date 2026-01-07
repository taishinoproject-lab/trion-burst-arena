import Phaser from 'phaser';
import { AVAILABLE_BULLET_TYPES, DIFFICULTY_DAMAGE_MULTIPLIER, Difficulty, GAME_CONFIG, BulletType, GameState } from '../constants';
import { Player } from '../entities/Player';
import { Boss, BossConfig } from '../entities/Boss';
import { Bullet } from '../entities/Bullet';
import { Shield, ShieldType } from '../entities/Shield';

type EnemyPattern = 'mixed' | 'delayedAsteroid' | 'meteoraBarrage';

interface EnemyBehavior {
  pattern: EnemyPattern;
  delayedShotChance: number;
  bulletWeights?: { asteroid: number; meteora: number; viper: number; hound: number; red: number };
  redShotChance?: number;
  houndIntervalMs?: number;
}

interface EnemyEntry {
  boss: Boss;
  trion: number;
  maxTrion: number;
  behavior: EnemyBehavior;
  lastHoundTime?: number;
}

interface EnemyTarget {
  boss: Boss;
  getTrion: () => number;
  setTrion: (value: number) => void;
  maxTrion: number;
}

interface TutorialStep {
  title: string;
  description: string[];
  onEnter?: () => void;
  isCompleted: () => boolean;
  requiredBulletType?: BulletType;
  requiredHits?: number;
  requiredShieldType?: ShieldType;
  focusTarget?: 'trionMeter' | 'triggerDisplay' | 'player' | 'backButton' | 'viperSettings';
  requiresSwitch?: boolean;
  requiresShieldBreak?: boolean;
  requiresDelayToggle?: boolean;
  requiresViperSettings?: boolean;
  requiresViperModeHits?: boolean;
  countShieldHits?: boolean;
  enemyShieldType?: ShieldType;
  enemyMovement?: 'none' | 'sideToSide';
}

type ViperPathOffset = { x: number; y: number };

export class MainScene extends Phaser.Scene {
  private player!: Player;
  private boss!: Boss;
  private extraEnemies: EnemyEntry[] = [];
  private playerBullets: Bullet[] = [];
  private bossBullets: Bullet[] = [];
  private playerShield: Shield | null = null;
  private spawnedShieldedEnemy = false;
  private spawnedRapidEnemy = false;
  private difficulty: Difficulty = 'easy';
  private gameStarted = false;
  private battleStartTime = 0;
  private readonly fireDelayMs = 2000;
  private readonly maxPlayerBullets = 240;
  private readonly maxBossBullets = 300;
  private isMobileMode = false;
  private selectedBulletTypes: BulletType[] = ['asteroid', 'meteora', 'viper'];
  private availableBulletTypes: BulletType[] = ['asteroid', 'meteora', 'viper', 'hound'];
  private isTutorialMode = false;
  private viperModeIndex = 0;
  private viperPathOffsets: ViperPathOffset[][] = [
    [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    [
      { x: 60, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 0 },
      { x: 60, y: 0 },
      { x: 0, y: 0 },
    ],
    [
      { x: -90, y: 0 },
      { x: -40, y: 0 },
      { x: 40, y: 0 },
      { x: 90, y: 0 },
      { x: 0, y: 0 },
    ],
  ];
  private viperSettingsCleanup?: () => void;
  private lastBulletType?: BulletType;
  
  private gameState: GameState = {
    playerTrion: GAME_CONFIG.PLAYER_TRION_MAX,
    bossTrion: this.getBossMaxTrion(),
    currentBulletType: 'asteroid',
    delayedAsteroidEnabled: false,
    isGameOver: false,
    playerWon: false,
    availableBulletTypes: [...this.availableBulletTypes],
  };
  
  // Input
  private lastFireTime: number = 0;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private qKey!: Phaser.Input.Keyboard.Key;
  private eKey!: Phaser.Input.Keyboard.Key;
  private rKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private wKey!: Phaser.Input.Keyboard.Key;
  private aKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;
  private dKey!: Phaser.Input.Keyboard.Key;
  
  // Mobile input state
  private mobileInput = {
    moveX: 0,
    moveY: 0,
    attacking: false,
    aimX: GAME_CONFIG.WIDTH / 2,
    aimY: 0,
  };
  
  // UI Elements
  private playerTrionBar!: Phaser.GameObjects.Graphics;
  private bossTrionBar!: Phaser.GameObjects.Graphics;
  private playerTrionText!: Phaser.GameObjects.Text;
  private bossTrionText!: Phaser.GameObjects.Text;
  private bulletTypeText!: Phaser.GameObjects.Text;
  private delayedAsteroidText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private instructionsOverlay!: Phaser.GameObjects.Container;
  private instructionsContent?: Phaser.GameObjects.Container;
  private tutorialOverlay?: Phaser.GameObjects.Container;
  private tutorialHelpText?: Phaser.GameObjects.Text;
  private tutorialHelpHighlight?: Phaser.GameObjects.Graphics;
  private tutorialHelpHighlightTween?: Phaser.Tweens.Tween;
  private tutorialFocusHighlight?: Phaser.GameObjects.Graphics;
  private tutorialFocusHighlightTween?: Phaser.Tweens.Tween;
  private tutorialBackButton?: Phaser.GameObjects.Rectangle;
  private tutorialBackText?: Phaser.GameObjects.Text;
  private tutorialBackButtonTween?: Phaser.Tweens.Tween;
  private tutorialViperButton?: Phaser.GameObjects.Rectangle;
  private tutorialViperText?: Phaser.GameObjects.Text;
  private tutorialTapReady = false;
  private enemyBars: Phaser.GameObjects.Graphics[] = [];
  private enemyTexts: Phaser.GameObjects.Text[] = [];
  private enemyLabels: Phaser.GameObjects.Text[] = [];
  private damageTexts: Phaser.GameObjects.Text[] = [];
  private instructionScrollCleanup?: () => void;
  private instructionsBackground?: Phaser.GameObjects.Rectangle;
  private tutorialSteps: TutorialStep[] = [];
  private tutorialStepIndex = 0;
  private instructionStartMode: 'modeSelect' | 'twoPlayer' = 'modeSelect';
  private tutorialShieldFireActive = false;
  private tutorialShieldFireEvent?: Phaser.Time.TimerEvent;
  private tutorialEnemyMovement: 'none' | 'sideToSide' = 'none';
  private tutorialEnemyMovementTimer = 0;
  private tutorialEnemyBaseX = 0;
  private tutorialProgress = {
    introAcknowledged: false,
    moved: false,
    fired: false,
    shieldDeployed: false,
    shieldBroken: false,
    wideShieldDeployed: false,
    wideShieldBroken: false,
    switched: false,
    requiredBulletHits: 0,
    delayedAsteroidToggled: false,
    viperSettingsOpened: false,
    viperModeHits: [false, false, false] as boolean[],
    summaryAcknowledged: false,
  };

  private getBossMaxTrion() {
    return this.difficulty === 'hard' ? GAME_CONFIG.BOSS_TRION_MAX * 2 : GAME_CONFIG.BOSS_TRION_MAX;
  }

  private getBulletDisplayName(type: BulletType) {
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
        return type;
    }
  }

  public setMobileMode(mobile: boolean) {
    this.isMobileMode = mobile;
  }

  public getCurrentBulletType() {
    return this.gameState.currentBulletType;
  }

  public isBattleActive() {
    return this.gameStarted;
  }

  public isTutorialActive() {
    return this.isTutorialMode;
  }

  constructor() {
    super({ key: 'MainScene' });
  }

  init(data?: { instructionStartMode?: 'modeSelect' | 'twoPlayer' }) {
    this.instructionStartMode = data?.instructionStartMode ?? 'modeSelect';
    const mobileFromRegistry = this.registry.get('isMobile');
    if (typeof mobileFromRegistry === 'boolean') {
      this.isMobileMode = mobileFromRegistry;
    }
  }

  create() {
    this.isTutorialMode = false;
    this.tutorialOverlay = undefined;
    this.events.emit('tutorial-state-changed', this.isTutorialMode);
    // Background
    this.cameras.main.setBackgroundColor(GAME_CONFIG.BACKGROUND_COLOR);
    
    // Add grid pattern for visual interest
    this.createBackgroundGrid();
    
    // Create player
    this.player = new Player(this, GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT - 150);
    
    // Create boss
    this.boss = new Boss(this, GAME_CONFIG.WIDTH / 2, 180);
    
    // Setup input
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.qKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.rKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.wKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.aKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.sKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.dKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.input.keyboard?.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.SHIFT]);

    // Mouse input for shooting
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.gameState.isGameOver || !this.gameStarted) return;

      if (pointer.middleButtonDown()) {
        return;
      }
      this.registerTutorialTap();
      this.tryFireBullet();
    });
    
    // Create UI
    this.createUI();
    
    // Show instructions briefly
    this.showInstructions();
    
    // Reset game state
    this.availableBulletTypes = [...this.selectedBulletTypes];
    this.clearCombatEntities();
    this.resetState();
    this.gameStarted = false;
    this.battleStartTime = 0;
    this.events.emit('battle-state-changed', this.gameStarted);
  }

  private createBackgroundGrid() {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x1a1a3a, 0.3);
    
    const gridSize = 60;
    for (let x = 0; x < GAME_CONFIG.WIDTH; x += gridSize) {
      graphics.moveTo(x, 0);
      graphics.lineTo(x, GAME_CONFIG.HEIGHT);
    }
    for (let y = 0; y < GAME_CONFIG.HEIGHT; y += gridSize) {
      graphics.moveTo(0, y);
      graphics.lineTo(GAME_CONFIG.WIDTH, y);
    }
    graphics.strokePath();
    graphics.setDepth(-10);
  }

  private createUI() {
    // Mobile-responsive sizing
    const isMobile = this.isMobileMode;
    const scaleFactor = isMobile ? 0.65 : 1;
    
    const uiY = isMobile ? 18 : 30;
    const barWidth = isMobile ? 160 : 250;
    const barHeight = isMobile ? 16 : 24;
    const labelFontSize = isMobile ? '11px' : '14px';
    const valueFontSize = isMobile ? '12px' : '16px';
    const marginX = isMobile ? 12 : 20;
    
    // Player Trion UI (left side)
    this.add.text(marginX, uiY - (isMobile ? 4 : 8), isMobile ? 'P トリオン' : 'プレイヤートリオン', {
      fontSize: labelFontSize,
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    
    this.playerTrionBar = this.add.graphics();
    this.playerTrionText = this.add.text(marginX + barWidth + 6, uiY + (isMobile ? 6 : 12), '', {
      fontSize: valueFontSize,
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    
    // Boss Trion UI (right side)
    const bossLabelX = GAME_CONFIG.WIDTH - marginX - barWidth;
    this.add.text(bossLabelX, uiY - (isMobile ? 4 : 8), isMobile ? 'B トリオン' : 'ボストリオン', {
      fontSize: labelFontSize,
      color: '#ff6b6b',
      fontFamily: 'monospace',
    });
    
    this.bossTrionBar = this.add.graphics();
    this.bossTrionText = this.add.text(bossLabelX - (isMobile ? 36 : 50), uiY + (isMobile ? 6 : 12), '', {
      fontSize: valueFontSize,
      color: '#ffffff',
      fontFamily: 'monospace',
    });

    const enemyBarWidth = isMobile ? 100 : 160;
    const enemyBarHeight = isMobile ? 8 : 12;
    const enemyStartY = uiY + (isMobile ? 30 : 44);
    const enemySpacing = isMobile ? 18 : 26;

    for (let i = 0; i < 2; i += 1) {
      const y = enemyStartY + i * enemySpacing;
      const label = this.add.text(
        GAME_CONFIG.WIDTH - marginX - enemyBarWidth,
        y - (isMobile ? 6 : 10),
        `敵 ${i + 1}`,
        {
          fontSize: isMobile ? '10px' : '12px',
          color: '#ffb347',
          fontFamily: 'monospace',
        }
      );
      const bar = this.add.graphics();
      const text = this.add.text(
        GAME_CONFIG.WIDTH - marginX - enemyBarWidth - (isMobile ? 28 : 40),
        y + (isMobile ? 0 : 2),
        '',
        {
          fontSize: isMobile ? '10px' : '12px',
          color: '#ffffff',
          fontFamily: 'monospace',
        }
      );
      label.setVisible(false);
      bar.setVisible(false);
      text.setVisible(false);
      this.enemyLabels.push(label);
      this.enemyBars.push(bar);
      this.enemyTexts.push(text);
    }
    
    // Bottom UI - Bullet type and Delay status
    const isCompactLayout = isMobile && this.scale.displaySize.height < 600;
    const bottomY = GAME_CONFIG.HEIGHT - (isMobile ? (isCompactLayout ? 40 : 52) : 40);
    const panelWidth = isMobile ? (isCompactLayout ? 290 : 330) : 360;
    const panelHeight = isMobile ? (isCompactLayout ? 46 : 56) : 50;
    
    // Background panel for bottom UI
    const panel = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      bottomY,
      panelWidth,
      panelHeight,
      GAME_CONFIG.UI_BG_COLOR,
      0.8
    );
    panel.setStrokeStyle(1, GAME_CONFIG.BULLET_COLOR, 0.5);
    
    const bottomFontSize = isMobile ? (isCompactLayout ? '14px' : '16px') : '18px';
    const bottomTextY = bottomY - (isMobile ? (isCompactLayout ? 8 : 10) : 10);
    this.bulletTypeText = this.add.text(
      GAME_CONFIG.WIDTH / 2 - (isMobile ? (isCompactLayout ? 110 : 125) : 140),
      bottomTextY,
      '',
      {
        fontSize: bottomFontSize,
        color: '#00ffd5',
        fontFamily: 'monospace',
      }
    );
    
    this.delayedAsteroidText = this.add.text(
      GAME_CONFIG.WIDTH / 2 + (isMobile ? (isCompactLayout ? 10 : 18) : 40),
      bottomTextY,
      '',
      {
        fontSize: bottomFontSize,
        color: '#ffffff',
        fontFamily: 'monospace',
      }
    );
    
    // Game over text (hidden initially)
    this.gameOverText = this.add.text(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2, '', {
      fontSize: isMobile ? '36px' : '48px',
      color: '#ffffff',
      fontFamily: 'monospace',
      align: 'center',
    });
    this.gameOverText.setOrigin(0.5);
    this.gameOverText.setVisible(false);

    // Tutorial text positioned for mobile visibility
    const tutorialTextX = GAME_CONFIG.WIDTH - (isMobile ? 10 : 32);
    const tutorialTextY = isMobile ? 14 : 24;
    const tutorialWrapWidth = isMobile ? Math.round(GAME_CONFIG.WIDTH * 0.42) : undefined;
    this.tutorialHelpText = this.add.text(tutorialTextX, tutorialTextY, '', {
      fontSize: isMobile ? (isCompactLayout ? '15px' : '16px') : '15px',
      color: '#ffffff',
      fontFamily: 'monospace',
      align: 'right',
      lineSpacing: isMobile ? 6 : 6,
      backgroundColor: '#0a0a12',
      padding: isMobile ? { x: 14, y: 12 } : { x: 16, y: 12 },
      wordWrap: tutorialWrapWidth ? { width: tutorialWrapWidth, useAdvancedWrap: true } : undefined,
    });
    this.tutorialHelpText.setOrigin(1, 0);
    this.tutorialHelpText.setVisible(false);
    this.tutorialHelpText.setDepth(90);

    this.tutorialHelpHighlight = this.add.graphics();
    this.tutorialHelpHighlight.setVisible(false);
    this.tutorialHelpHighlight.setDepth(89);

    this.tutorialFocusHighlight = this.add.graphics();
    this.tutorialFocusHighlight.setVisible(false);
    this.tutorialFocusHighlight.setDepth(88);
  }

  private showInstructions() {
    const bg = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT / 2,
      GAME_CONFIG.WIDTH,
      GAME_CONFIG.HEIGHT,
      0x0a0a12,
      0.95
    );
    bg.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    this.instructionsBackground = bg;
    this.instructionsOverlay = this.add.container(0, 0, [bg]);
    this.instructionsOverlay.setDepth(100);
    if (this.instructionStartMode === 'twoPlayer') {
      this.showTwoPlayerInstructions();
      return;
    }
    this.showModeSelectInstructions();
  }

  private ensureInstructionsOverlay() {
    if (this.instructionsOverlay?.active && this.instructionsOverlay.scene) return;
    const bg = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT / 2,
      GAME_CONFIG.WIDTH,
      GAME_CONFIG.HEIGHT,
      0x0a0a12,
      0.95
    );
    bg.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    this.instructionsBackground = bg;
    this.instructionsOverlay = this.add.container(0, 0, [bg]);
    this.instructionsOverlay.setDepth(100);
  }

  private getInstructionLayout() {
    const isCompactLayout = this.isMobileMode && this.scale.displaySize.height < 600;
    const isLandscapeMobile =
      this.isMobileMode && this.scale.displaySize.width > this.scale.displaySize.height;
    // Reduce vertical offset for better centering on mobile
    const layoutOffsetY = this.isMobileMode
      ? (isCompactLayout ? -110 : -40) + (isLandscapeMobile ? -50 : 0)
      : 0;
    const layoutCenterY = GAME_CONFIG.HEIGHT / 2 + layoutOffsetY;
    // Smaller buttons for mobile to prevent overflow
    const actionButtonWidth = this.isMobileMode ? (isCompactLayout ? 260 : 300) : 180;
    const actionButtonHeight = this.isMobileMode ? (isCompactLayout ? 56 : 68) : 50;

    return {
      isCompactLayout,
      isLandscapeMobile,
      layoutCenterY,
      actionButtonWidth,
      actionButtonHeight,
    };
  }

  private setInstructionsContent(
    elements: Phaser.GameObjects.GameObject[],
    enableScroll = false
  ) {
    this.viperSettingsCleanup?.();
    this.viperSettingsCleanup = undefined;
    this.instructionScrollCleanup?.();
    if (this.instructionsContent) {
      this.instructionsOverlay.remove(this.instructionsContent, true);
      this.instructionsContent.destroy(true);
    }
    this.instructionsContent = this.add.container(0, 0, elements);
    this.instructionsOverlay.add(this.instructionsContent);

    if (this.isMobileMode && enableScroll && this.instructionsBackground) {
      this.enableInstructionScroll(this.instructionsBackground, this.instructionsContent);
    }
  }

  private showModeSelectInstructions() {
    const { layoutCenterY, actionButtonHeight, isCompactLayout } = this.getInstructionLayout();
    const mobileScale = this.isMobileMode ? 3 : 1;
    const layoutBaseY = this.isMobileMode
      ? layoutCenterY + (isCompactLayout ? 80 : 100)
      : layoutCenterY;
    const titleY =
      layoutBaseY -
      (this.isMobileMode ? (isCompactLayout ? 60 : 80) * mobileScale : 230);
    const infoTextY =
      this.isMobileMode
        ? titleY + (isCompactLayout ? 38 : 45) * mobileScale
        : layoutBaseY - 130;
    const modeLabelY =
      layoutBaseY +
      (this.isMobileMode ? (isCompactLayout ? 20 : 30) * mobileScale : 10);
    const buttonY =
      this.isMobileMode
        ? modeLabelY + (isCompactLayout ? 45 : 55) * mobileScale
        : layoutBaseY + 90;
    const buttonSpacing = this.isMobileMode ? (isCompactLayout ? 12 : 16) * mobileScale : 30;
    // Larger buttons for mobile - use horizontal layout
    const baseButtonWidth = this.isMobileMode ? (isCompactLayout ? 200 : 220) : 200;
    const baseButtonHeight = this.isMobileMode ? (isCompactLayout ? 56 : 64) : 60;
    const mobileButtonAreaWidth = this.isMobileMode ? GAME_CONFIG.WIDTH * 0.66 : 0;
    const buttonWidth = this.isMobileMode
      ? Math.min(baseButtonWidth * mobileScale, (mobileButtonAreaWidth - buttonSpacing) / 2)
      : baseButtonWidth;
    const buttonHeight = this.isMobileMode ? baseButtonHeight * mobileScale : baseButtonHeight;
    const totalButtonWidth = buttonWidth * 2 + buttonSpacing;
    const firstButtonX = this.isMobileMode
      ? GAME_CONFIG.WIDTH / 2 - buttonWidth / 2 - buttonSpacing / 2
      : GAME_CONFIG.WIDTH / 2 - totalButtonWidth / 2 + buttonWidth / 2;
    const secondButtonX = this.isMobileMode
      ? GAME_CONFIG.WIDTH / 2 + buttonWidth / 2 + buttonSpacing / 2
      : firstButtonX + buttonWidth + buttonSpacing;
    const secondButtonY = buttonY;

    const instructionElements: Phaser.GameObjects.GameObject[] = [];

    // Decorative corner brackets
    const cornerSize = 20;
    const corners = this.add.graphics();
    corners.lineStyle(2, GAME_CONFIG.BULLET_COLOR, 0.6);
    // Top-left
    corners.moveTo(60, 40);
    corners.lineTo(40, 40);
    corners.lineTo(40, 60);
    // Top-right
    corners.moveTo(GAME_CONFIG.WIDTH - 60, 40);
    corners.lineTo(GAME_CONFIG.WIDTH - 40, 40);
    corners.lineTo(GAME_CONFIG.WIDTH - 40, 60);
    // Bottom-left
    corners.moveTo(60, GAME_CONFIG.HEIGHT - 40);
    corners.lineTo(40, GAME_CONFIG.HEIGHT - 40);
    corners.lineTo(40, GAME_CONFIG.HEIGHT - 60);
    // Bottom-right
    corners.moveTo(GAME_CONFIG.WIDTH - 60, GAME_CONFIG.HEIGHT - 40);
    corners.lineTo(GAME_CONFIG.WIDTH - 40, GAME_CONFIG.HEIGHT - 40);
    corners.lineTo(GAME_CONFIG.WIDTH - 40, GAME_CONFIG.HEIGHT - 60);
    corners.strokePath();
    instructionElements.push(corners);


    // Glowing title with shadow effect
    const titleFontSize = this.isMobileMode
      ? `${(isCompactLayout ? 34 : 38) * mobileScale}px`
      : '36px';
    const titleGlow = this.add.text(GAME_CONFIG.WIDTH / 2, titleY, '◆ トリオンバトル ◆', {
      fontSize: titleFontSize,
      color: '#00ffd5',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    titleGlow.setOrigin(0.5);
    titleGlow.setAlpha(0.3);
    titleGlow.setScale(1.05);
    instructionElements.push(titleGlow);

    const title = this.add.text(GAME_CONFIG.WIDTH / 2, titleY, '◆ トリオンバトル ◆', {
      fontSize: titleFontSize,
      color: '#00ffd5',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);
    instructionElements.push(title);

    // Pulsing title animation
    this.tweens.add({
      targets: [title, titleGlow],
      scaleX: 1.02,
      scaleY: 1.02,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });


    // Overview text with better styling - smaller on mobile
    const overviewFontSize = this.isMobileMode
      ? `${(isCompactLayout ? 12 : 14) * mobileScale}px`
      : '15px';
    const overviewLineSpacing = this.isMobileMode ? (isCompactLayout ? 6 : 8) * mobileScale : 8;
    const overviewText = this.add.text(
      GAME_CONFIG.WIDTH / 2,
      infoTextY,
      this.isMobileMode 
        ? '※ モバイル版は全画面表示ボタンを押し、\n横画面でお楽しみください'
        : '\n\n\n━━━ システム概要 ━━━\n' +
          '► トリオン = 生体エネルギー\n' +
          '► 攻撃・防御・被弾で減少 → 0で敗北\n' +
          '► トリガー = 武器 (3つ選択して戦闘)\n\n' +
          '※ PC推奨 | 初心者はボスモードから',
      {
        fontSize: overviewFontSize,
        color: '#cccccc',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: overviewLineSpacing,
      }
    );
    overviewText.setOrigin(0.5);
    instructionElements.push(overviewText);

    // Mode select label with decorative elements
    const modeLabelWidth = this.isMobileMode
      ? Math.min((isCompactLayout ? 160 : 180) * mobileScale, GAME_CONFIG.WIDTH * 0.66)
      : 240;
    const modeLabelBg = this.add.graphics();
    modeLabelBg.fillStyle(GAME_CONFIG.BULLET_COLOR, 0.1);
    modeLabelBg.fillRoundedRect(
      GAME_CONFIG.WIDTH / 2 - modeLabelWidth / 2,
      modeLabelY - (this.isMobileMode ? 10 * mobileScale : 15),
      modeLabelWidth,
      this.isMobileMode ? 22 * mobileScale : 30,
      5
    );
    instructionElements.push(modeLabelBg);

    const modeLabel = this.add.text(GAME_CONFIG.WIDTH / 2, modeLabelY, '▼ モード選択 ▼', {
      fontSize: this.isMobileMode
        ? `${(isCompactLayout ? 18 : 20) * mobileScale}px`
        : '18px',
      color: '#00ffd5',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    modeLabel.setOrigin(0.5);
    instructionElements.push(modeLabel);

    // Boss Mode Button with futuristic styling
    const bossButtonGlow = this.add.rectangle(
      firstButtonX,
      buttonY,
      buttonWidth + (this.isMobileMode ? 8 * mobileScale : 8),
      buttonHeight + (this.isMobileMode ? 8 * mobileScale : 8),
      GAME_CONFIG.BULLET_COLOR,
      0.15
    );
    bossButtonGlow.setStrokeStyle(1, GAME_CONFIG.BULLET_COLOR, 0.3);
    instructionElements.push(bossButtonGlow);

    const bossButton = this.add.rectangle(
      firstButtonX,
      buttonY,
      buttonWidth,
      buttonHeight,
      0x0a1a2a,
      0.95
    );
    bossButton.setStrokeStyle(3, GAME_CONFIG.BULLET_COLOR, 0.9);
    instructionElements.push(bossButton);

    // Boss button icon and text - smaller on mobile
    const buttonIconSize = this.isMobileMode
      ? `${(isCompactLayout ? 16 : 18) * mobileScale}px`
      : '20px';
    const buttonTextSize = this.isMobileMode
      ? `${(isCompactLayout ? 18 : 20) * mobileScale}px`
      : '18px';
    const buttonSubtextSize = this.isMobileMode
      ? `${(isCompactLayout ? 10 : 12) * mobileScale}px`
      : '11px';
    const iconOffsetY = this.isMobileMode ? (isCompactLayout ? -12 : -14) * mobileScale : -15;
    const textOffsetY = this.isMobileMode ? (isCompactLayout ? 6 : 7) * mobileScale : 5;
    const subtextOffsetY = this.isMobileMode ? (isCompactLayout ? 20 : 24) * mobileScale : 22;

    const bossIcon = this.add.text(firstButtonX, buttonY + iconOffsetY, '⬡', {
      fontSize: buttonIconSize,
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    bossIcon.setOrigin(0.5);
    instructionElements.push(bossIcon);

    const bossText = this.add.text(firstButtonX, buttonY + textOffsetY, 'ボスモード', {
      fontSize: buttonTextSize,
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    bossText.setOrigin(0.5);
    instructionElements.push(bossText);

    const bossSubtext = this.add.text(firstButtonX, buttonY + subtextOffsetY, '[ シングル ]', {
      fontSize: buttonSubtextSize,
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    bossSubtext.setOrigin(0.5);
    instructionElements.push(bossSubtext);

    // 2P Mode Button with different color scheme
    const twoPlayerButtonGlow = this.add.rectangle(
      secondButtonX,
      secondButtonY,
      buttonWidth + (this.isMobileMode ? 8 * mobileScale : 8),
      buttonHeight + (this.isMobileMode ? 8 * mobileScale : 8),
      0xffd166,
      0.15
    );
    twoPlayerButtonGlow.setStrokeStyle(1, 0xffd166, 0.3);
    instructionElements.push(twoPlayerButtonGlow);

    const twoPlayerButton = this.add.rectangle(
      secondButtonX,
      secondButtonY,
      buttonWidth,
      buttonHeight,
      0x1a1a0a,
      0.95
    );
    twoPlayerButton.setStrokeStyle(3, 0xffd166, 0.9);
    instructionElements.push(twoPlayerButton);

    // 2P button icon and text
    const twoPlayerIcon = this.add.text(secondButtonX, secondButtonY + iconOffsetY, '⬡⬡', {
      fontSize: this.isMobileMode
        ? `${(isCompactLayout ? 14 : 16) * mobileScale}px`
        : '16px',
      color: '#ffd166',
      fontFamily: 'monospace',
    });
    twoPlayerIcon.setOrigin(0.5);
    instructionElements.push(twoPlayerIcon);

    const twoPlayerText = this.add.text(secondButtonX, secondButtonY + textOffsetY, '対戦モード', {
      fontSize: buttonTextSize,
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    });
    twoPlayerText.setOrigin(0.5);
    instructionElements.push(twoPlayerText);

    const twoPlayerSubtext = this.add.text(
      secondButtonX,
      secondButtonY + subtextOffsetY,
      '[ ローカル ]',
      {
      fontSize: buttonSubtextSize,
      color: '#ffd166',
      fontFamily: 'monospace',
      }
    );
    twoPlayerSubtext.setOrigin(0.5);
    instructionElements.push(twoPlayerSubtext);

    // Button hover animations
    const setupButtonHover = (
      btn: Phaser.GameObjects.Rectangle,
      glow: Phaser.GameObjects.Rectangle,
      color: number
    ) => {
      btn.on('pointerover', () => {
        this.tweens.add({
          targets: glow,
          alpha: 0.4,
          scaleX: 1.05,
          scaleY: 1.05,
          duration: 150,
        });
        btn.setFillStyle(color === GAME_CONFIG.BULLET_COLOR ? 0x0a2a3a : 0x2a2a0a, 0.95);
      });
      btn.on('pointerout', () => {
        this.tweens.add({
          targets: glow,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          duration: 150,
        });
        btn.setFillStyle(color === GAME_CONFIG.BULLET_COLOR ? 0x0a1a2a : 0x1a1a0a, 0.95);
      });
    };

    setupButtonHover(bossButton, bossButtonGlow, GAME_CONFIG.BULLET_COLOR);
    setupButtonHover(twoPlayerButton, twoPlayerButtonGlow, 0xffd166);

    // Footer decoration - hide on very compact mobile
    const footerY = GAME_CONFIG.HEIGHT - (this.isMobileMode ? (isCompactLayout ? 30 : 40) : 50);
    const footer = this.add.text(
      GAME_CONFIG.WIDTH / 2,
      footerY,
      '[ タップして選択 ]',
      {
        fontSize: this.isMobileMode
          ? `${(isCompactLayout ? 11 : 13) * mobileScale}px`
          : '12px',
        color: '#555555',
        fontFamily: 'monospace',
      }
    );
    footer.setOrigin(0.5);
    this.tweens.add({
      targets: footer,
      alpha: 0.3,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
    instructionElements.push(footer);

    // Version indicator
    const version = this.add.text(
      GAME_CONFIG.WIDTH - 60,
      GAME_CONFIG.HEIGHT - 30,
      'v1.0',
      {
        fontSize: '12px',
        color: '#333333',
        fontFamily: 'monospace',
      }
    );
    version.setOrigin(0.5);
    instructionElements.push(version);

    // Interactive handlers
    const handleBossMode = () => {
      this.showBossSetupInstructions();
    };
    bossButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleBossMode);
    bossText.setInteractive({ useHandCursor: true }).on('pointerdown', handleBossMode);
    bossIcon.setInteractive({ useHandCursor: true }).on('pointerdown', handleBossMode);
    bossSubtext.setInteractive({ useHandCursor: true }).on('pointerdown', handleBossMode);

    const handleTwoPlayerMode = () => {
      this.showTwoPlayerInstructions();
    };
    twoPlayerButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleTwoPlayerMode);
    twoPlayerText.setInteractive({ useHandCursor: true }).on('pointerdown', handleTwoPlayerMode);
    twoPlayerIcon.setInteractive({ useHandCursor: true }).on('pointerdown', handleTwoPlayerMode);
    twoPlayerSubtext.setInteractive({ useHandCursor: true }).on('pointerdown', handleTwoPlayerMode);

    this.setInstructionsContent(instructionElements, true);
  }

  private showBossSetupInstructions() {
    const { isCompactLayout, layoutCenterY, actionButtonWidth, actionButtonHeight } =
      this.getInstructionLayout();
    // Adjust positions for mobile
    const titleY = layoutCenterY - (this.isMobileMode ? (isCompactLayout ? 150 : 170) : 220);
    const tutorialButtonY = layoutCenterY - (this.isMobileMode ? (isCompactLayout ? 80 : 100) : 160);
    const detailButtonY = tutorialButtonY + (this.isMobileMode ? (isCompactLayout ? 70 : 80) : 70);
    const difficultyLabelY = this.isMobileMode
      ? detailButtonY + (isCompactLayout ? 70 : 80)
      : layoutCenterY - 20;

    const title = this.add.text(GAME_CONFIG.WIDTH / 2, titleY, '- トリオンバトル -', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '26px' : '32px') : '28px',
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    title.setOrigin(0.5);

    const instructionElements: Phaser.GameObjects.GameObject[] = [title];

    // Smaller back button for mobile
    const backButtonX = this.isMobileMode ? (isCompactLayout ? 80 : 100) : 110;
    const backButtonY = this.isMobileMode ? (isCompactLayout ? 46 : 56) : 60;
    const backButtonWidth = this.isMobileMode ? (isCompactLayout ? 140 : 180) : 150;
    const backButtonHeight = this.isMobileMode ? (isCompactLayout ? 44 : 52) : 44;
    const backButton = this.add.rectangle(
      backButtonX,
      backButtonY,
      backButtonWidth,
      backButtonHeight,
      0x1a1a3a,
      0.95
    );
    backButton.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    const backText = this.add.text(backButtonX, backButtonY, '戻る', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '16px' : '18px') : '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    backText.setOrigin(0.5);
    const handleBack = () => {
      this.showModeSelectInstructions();
    };
    backButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    backText.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    instructionElements.push(backButton, backText);

    const tutorialButton = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      tutorialButtonY,
      actionButtonWidth,
      actionButtonHeight,
      0x1a1a3a,
      0.95
    );
    tutorialButton.setStrokeStyle(3, GAME_CONFIG.BULLET_COLOR, 0.9);
    const tutorialText = this.add.text(GAME_CONFIG.WIDTH / 2, tutorialButtonY, 'チュートリアル', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '18px' : '20px') : '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    tutorialText.setOrigin(0.5);
    const handleTutorial = () => {
      this.startTutorial();
    };
    tutorialButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleTutorial);
    tutorialText.setInteractive({ useHandCursor: true }).on('pointerdown', handleTutorial);
    instructionElements.push(tutorialButton, tutorialText);

    const detailButton = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      detailButtonY,
      actionButtonWidth,
      actionButtonHeight,
      0x1a1a3a,
      0.95
    );
    detailButton.setStrokeStyle(2, 0x4ad6ff, 0.9);
    const detailText = this.add.text(
      GAME_CONFIG.WIDTH / 2,
      detailButtonY,
      'トリガーの詳細',
      {
        fontSize: this.isMobileMode ? (isCompactLayout ? '16px' : '18px') : '16px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }
    );
    detailText.setOrigin(0.5);
    const handleDetail = () => {
      this.showCommandDetailInstructions('boss');
    };
    detailButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleDetail);
    detailText.setInteractive({ useHandCursor: true }).on('pointerdown', handleDetail);
    instructionElements.push(detailButton, detailText);

    const difficultyLabel = this.add.text(GAME_CONFIG.WIDTH / 2, difficultyLabelY, '難易度選択', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '18px' : '22px') : '18px',
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    difficultyLabel.setOrigin(0.5);

    const viperButtonX = this.isMobileMode ? GAME_CONFIG.WIDTH - 130 : GAME_CONFIG.WIDTH - 200;
    const viperButtonWidth = this.isMobileMode ? (isCompactLayout ? 170 : 190) : 170;
    const viperButtonHeight = this.isMobileMode ? (isCompactLayout ? 44 : 52) : 40;
    const viperButton = this.add.rectangle(
      viperButtonX,
      difficultyLabelY,
      viperButtonWidth,
      viperButtonHeight,
      0x1a1a3a,
      0.95
    );
    viperButton.setStrokeStyle(2, 0x4ad6ff, 0.9);
    const viperText = this.add.text(viperButtonX, difficultyLabelY, 'バイパー設定', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '14px' : '16px') : '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    viperText.setOrigin(0.5);
    const handleViperSettings = () => {
      this.showViperSettingsInstructions();
    };
    viperButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleViperSettings);
    viperText.setInteractive({ useHandCursor: true }).on('pointerdown', handleViperSettings);

    // Difficulty level selector (single box with arrows)
    const selectorWidth = this.isMobileMode ? (isCompactLayout ? 190 : 210) : 200;
    const selectorHeight = this.isMobileMode ? (isCompactLayout ? 48 : 56) : 44;
    const selectorY = difficultyLabelY + (this.isMobileMode ? (isCompactLayout ? 70 : 80) : 80);
    const selectorX = GAME_CONFIG.WIDTH / 2;
    const arrowButtonSize = this.isMobileMode ? (isCompactLayout ? 32 : 36) : 32;
    const arrowGap = this.isMobileMode ? (isCompactLayout ? 14 : 16) : 16;
    const arrowOffset = selectorWidth / 2 + arrowButtonSize / 2 + arrowGap;

    const difficultyLevels = [
      { level: 0, difficulty: 'easy' as Difficulty, label: 'レベル0', color: GAME_CONFIG.BULLET_COLOR, textColor: '#00ffd5' },
      { level: 1, difficulty: 'middle' as Difficulty, label: 'レベル1', color: 0xffd166, textColor: '#ffd166' },
      { level: 2, difficulty: 'hard' as Difficulty, label: 'レベル2', color: 0xff6b6b, textColor: '#ff6b6b' },
    ];
    const initialLevelIndex = Math.max(
      0,
      difficultyLevels.findIndex((level) => level.difficulty === this.difficulty)
    );
    let selectedLevelIndex = initialLevelIndex;

    const selectorBg = this.add.rectangle(
      selectorX,
      selectorY,
      selectorWidth,
      selectorHeight,
      0x1a1a3a,
      0.9
    );
    selectorBg.setStrokeStyle(3, difficultyLevels[selectedLevelIndex].color, 0.8);

    const levelFontSize = this.isMobileMode ? (isCompactLayout ? '18px' : '20px') : '20px';
    const levelText = this.add.text(selectorX, selectorY, difficultyLevels[selectedLevelIndex].label, {
      fontSize: levelFontSize,
      color: difficultyLevels[selectedLevelIndex].textColor,
      fontFamily: 'monospace',
    });
    levelText.setOrigin(0.5);

    const leftArrowBg = this.add.rectangle(
      selectorX - arrowOffset,
      selectorY,
      arrowButtonSize,
      arrowButtonSize,
      0x1a1a3a,
      0.95
    );
    leftArrowBg.setStrokeStyle(2, 0x4ad6ff, 0.9);
    const leftArrowText = this.add.text(selectorX - arrowOffset, selectorY, '◀', {
      fontSize: this.isMobileMode ? '16px' : '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    leftArrowText.setOrigin(0.5);

    const rightArrowBg = this.add.rectangle(
      selectorX + arrowOffset,
      selectorY,
      arrowButtonSize,
      arrowButtonSize,
      0x1a1a3a,
      0.95
    );
    rightArrowBg.setStrokeStyle(2, 0x4ad6ff, 0.9);
    const rightArrowText = this.add.text(selectorX + arrowOffset, selectorY, '▶', {
      fontSize: this.isMobileMode ? '16px' : '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    rightArrowText.setOrigin(0.5);

    const promptText = !this.isMobileMode
      ? this.add.text(
          GAME_CONFIG.WIDTH / 2,
          layoutCenterY + 140,
          '難易度と3種のトリガーを選んでから開始',
          {
            fontSize: '16px',
            color: '#ffffff',
            fontFamily: 'monospace',
            align: 'center',
            lineSpacing: 6,
          }
        )
      : null;
    promptText?.setOrigin(0.5);

    const updateDifficultySelection = (levelIndex: number) => {
      selectedLevelIndex = Phaser.Math.Clamp(levelIndex, 0, difficultyLevels.length - 1);
      const currentLevel = difficultyLevels[selectedLevelIndex];
      this.difficulty = currentLevel.difficulty;
      levelText.setText(currentLevel.label);
      levelText.setColor(currentLevel.textColor);
      selectorBg.setStrokeStyle(3, currentLevel.color, 0.8);
      const isAtStart = selectedLevelIndex === 0;
      const isAtEnd = selectedLevelIndex === difficultyLevels.length - 1;
      const leftAlpha = isAtStart ? 0.4 : 1;
      const rightAlpha = isAtEnd ? 0.4 : 1;
      leftArrowBg.setAlpha(leftAlpha);
      leftArrowText.setAlpha(leftAlpha);
      rightArrowBg.setAlpha(rightAlpha);
      rightArrowText.setAlpha(rightAlpha);
    };

    updateDifficultySelection(selectedLevelIndex);

    const handleLevelChange = (direction: number) => {
      updateDifficultySelection(selectedLevelIndex + direction);
    };

    leftArrowBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      handleLevelChange(-1);
    });
    leftArrowText.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      handleLevelChange(-1);
    });

    rightArrowBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      handleLevelChange(1);
    });
    rightArrowText.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      handleLevelChange(1);
    });

    instructionElements.push(
      difficultyLabel,
      viperButton,
      viperText,
      selectorBg,
      levelText,
      leftArrowBg,
      leftArrowText,
      rightArrowBg,
      rightArrowText
    );
    if (promptText) {
      instructionElements.push(promptText);
    }

    const weaponStatusY = this.isMobileMode
      ? selectorY + (isCompactLayout ? 52 : 60)
      : layoutCenterY + 190;
    const weaponStatus = this.add.text(GAME_CONFIG.WIDTH / 2, weaponStatusY, '', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '14px' : '16px') : '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      align: 'center',
      lineSpacing: 2,
    });
    weaponStatus.setOrigin(0.5);
    instructionElements.push(weaponStatus);

    const weaponButtons: { type: BulletType; bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
    // Smaller weapon buttons for mobile - 4 in a row
    const weaponButtonWidth = this.isMobileMode ? (isCompactLayout ? 92 : 104) : 120;
    const weaponButtonHeight = this.isMobileMode ? (isCompactLayout ? 40 : 44) : 40;
    const weaponSpacing = this.isMobileMode ? (isCompactLayout ? 8 : 10) : 16;
    const weaponStartY = this.isMobileMode
      ? weaponStatusY + (isCompactLayout ? 30 : 36)
      : layoutCenterY + 245;
    const weaponRowSpacing = this.isMobileMode ? (isCompactLayout ? 50 : 56) : 50;
    const weaponButtonsPerRow = this.isMobileMode ? 5 : 5;
    const weaponRowCount = Math.ceil(AVAILABLE_BULLET_TYPES.length / weaponButtonsPerRow);
    const weaponTotalWidth = weaponButtonWidth * weaponButtonsPerRow + weaponSpacing * (weaponButtonsPerRow - 1);
    const weaponStartX = GAME_CONFIG.WIDTH / 2 - weaponTotalWidth / 2 + weaponButtonWidth / 2;

    const weaponNames: Record<BulletType, string> = {
      asteroid: 'アステロイド',
      meteora: 'メテオラ',
      viper: 'バイパー',
      red: 'レッドバレット',
      hound: 'ハウンド',
    };
    // Short names for compact mobile
    const weaponNamesShort: Record<BulletType, string> = {
      asteroid: 'アステロイド',
      meteora: 'メテオラ',
      viper: 'バイパー',
      red: 'レッド',
      hound: 'ハウンド',
    };

    const startButtonY = this.isMobileMode
      ? weaponStartY + (isCompactLayout ? 70 : 80)
      : layoutCenterY + 320;
    const startButton = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      startButtonY,
      actionButtonWidth,
      actionButtonHeight,
      0x1a1a3a,
      0.95
    );
    startButton.setStrokeStyle(3, GAME_CONFIG.BULLET_COLOR, 0.9);
    const startText = this.add.text(GAME_CONFIG.WIDTH / 2, startButtonY, 'スタート', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '18px' : '20px') : '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    startText.setOrigin(0.5);

    const updateWeaponButtons = () => {
      const statusText = this.isMobileMode && isCompactLayout 
        ? `${this.selectedBulletTypes.length}/3`
        : `選択中: ${this.selectedBulletTypes.length}/3`;
      weaponStatus.setText(statusText);
      weaponButtons.forEach(({ type, bg, label }) => {
        const selected = this.selectedBulletTypes.includes(type);
        const strokeColor = selected ? GAME_CONFIG.BULLET_COLOR : 0x444444;
        const textColor = selected ? '#00ffd5' : '#aaaaaa';
        bg.setStrokeStyle(3, strokeColor, selected ? 0.9 : 0.5);
        label.setColor(textColor);
      });
      startButton.setAlpha(this.selectedBulletTypes.length === 3 ? 1 : 0.45);
    };

    const weaponLabelFontSize = this.isMobileMode ? (isCompactLayout ? '12px' : '13px') : '14px';

    AVAILABLE_BULLET_TYPES.forEach((type, index) => {
      const row = this.isMobileMode ? Math.floor(index / weaponButtonsPerRow) : 0;
      const col = this.isMobileMode ? index % weaponButtonsPerRow : index;
      if (row >= weaponRowCount) return;
      const x = weaponStartX + col * (weaponButtonWidth + weaponSpacing);
      const y = weaponStartY + row * weaponRowSpacing;
      const bg = this.add.rectangle(x, y, weaponButtonWidth, weaponButtonHeight, 0x1a1a3a, 0.9);
      bg.setStrokeStyle(3, 0x444444, 0.5);
      const displayName = this.isMobileMode && isCompactLayout ? weaponNamesShort[type] : weaponNames[type];
      const label = this.add.text(x, y, displayName, {
        fontSize: weaponLabelFontSize,
        color: '#aaaaaa',
        fontFamily: 'monospace',
      });
      label.setOrigin(0.5);
      const toggleSelection = () => {
        if (this.selectedBulletTypes.includes(type)) {
          this.selectedBulletTypes = this.selectedBulletTypes.filter(item => item !== type);
        } else if (this.selectedBulletTypes.length < 3) {
          this.selectedBulletTypes = [...this.selectedBulletTypes, type];
        }
        updateWeaponButtons();
      };
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', toggleSelection);
      label.setInteractive({ useHandCursor: true }).on('pointerdown', toggleSelection);
      weaponButtons.push({ type, bg, label });
      instructionElements.push(bg, label);
    });

    const handleStart = () => {
      if (this.selectedBulletTypes.length !== 3) return;
      this.startBattle();
    };
    startButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleStart);
    startText.setInteractive({ useHandCursor: true }).on('pointerdown', handleStart);
    instructionElements.push(startButton, startText);

    updateWeaponButtons();

    this.setInstructionsContent(instructionElements, true);
  }

  private showViperSettingsInstructions(returnTarget: 'boss' | 'twoPlayer' | 'tutorial' = 'boss') {
    this.ensureInstructionsOverlay();
    const { layoutCenterY, isCompactLayout } = this.getInstructionLayout();
    const titleY = layoutCenterY - (this.isMobileMode ? (isCompactLayout ? 200 : 210) : 230);
    const title = this.add.text(GAME_CONFIG.WIDTH / 2, titleY, 'バイパー弾道設定', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '26px' : '30px') : '26px',
      color: '#00e5ff',
      fontFamily: 'monospace',
    });
    title.setOrigin(0.5);

    const instructionElements: Phaser.GameObjects.GameObject[] = [title];

    const backButtonX = this.isMobileMode ? (isCompactLayout ? 80 : 100) : 110;
    const backButtonY = this.isMobileMode ? (isCompactLayout ? 46 : 56) : 60;
    const backButtonWidth = this.isMobileMode ? (isCompactLayout ? 140 : 180) : 150;
    const backButtonHeight = this.isMobileMode ? (isCompactLayout ? 44 : 52) : 44;
    const backButton = this.add.rectangle(
      backButtonX,
      backButtonY,
      backButtonWidth,
      backButtonHeight,
      0x1a1a3a,
      0.95
    );
    backButton.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    const backText = this.add.text(backButtonX, backButtonY, '戻る', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '16px' : '18px') : '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    backText.setOrigin(0.5);
    const handleBack = () => {
      if (returnTarget === 'twoPlayer') {
        this.showTwoPlayerInstructions();
        return;
      }
      if (returnTarget === 'tutorial') {
        this.destroyInstructionsOverlay();
        this.setTutorialOverlayVisible(true);
        this.updateTutorialHelpText();
        return;
      }
      this.showBossSetupInstructions();
    };
    backButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    backText.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    instructionElements.push(backButton, backText);

    const pathHeight = this.isMobileMode ? (isCompactLayout ? 260 : 300) : 320;
    const baseX = this.isMobileMode ? GAME_CONFIG.WIDTH * 0.26 : GAME_CONFIG.WIDTH * 0.3;
    const startY = layoutCenterY - pathHeight / 2;
    const endY = layoutCenterY + pathHeight / 2;
    const segmentCount = 5;
    const segmentSpacing = pathHeight / segmentCount;
    const maxOffset = GAME_CONFIG.VIPER_PATH_MAX_OFFSET;

    const pathGraphics = this.add.graphics();
    instructionElements.push(pathGraphics);

    const startPoint = this.add.circle(
      baseX,
      startY,
      this.isMobileMode ? (isCompactLayout ? 9 : 10) : 8,
      0x00ffd5
    );
    const endPoint = this.add.circle(
      baseX,
      endY,
      this.isMobileMode ? (isCompactLayout ? 9 : 10) : 8,
      0xffd166
    );
    const startLabel = this.add.text(
      baseX,
      startY - (this.isMobileMode ? 12 : 16),
      'スタート(発射)',
      {
        fontSize: this.isMobileMode ? (isCompactLayout ? '13px' : '14px') : '14px',
        color: '#00ffd5',
        fontFamily: 'monospace',
      }
    );
    startLabel.setOrigin(0.5, 1);
    const endLabel = this.add.text(
      baseX,
      endY + (this.isMobileMode ? 10 : 14),
      'ゴール(着弾)',
      {
        fontSize: this.isMobileMode ? (isCompactLayout ? '13px' : '14px') : '14px',
        color: '#ffd166',
        fontFamily: 'monospace',
      }
    );
    endLabel.setOrigin(0.5, 0);
    instructionElements.push(startPoint, endPoint, startLabel, endLabel);

    const midPoints: Phaser.GameObjects.Arc[] = [];
    const midPointYs = Array.from({ length: 4 }, (_, index) => startY + segmentSpacing * (index + 1));
    midPointYs.forEach((y) => {
      const point = this.add.circle(baseX, y, this.isMobileMode ? 10 : 9, 0x00e5ff);
      point.setStrokeStyle(2, 0xffffff, 0.6);
      point.setInteractive({ useHandCursor: true, draggable: true });
      this.input.setDraggable(point);
      midPoints.push(point);
      instructionElements.push(point);
    });
    endPoint.setStrokeStyle(2, 0xffffff, 0.6);
    endPoint.setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(endPoint);

    let activeModeIndex = this.viperModeIndex;
    const basePointYs = [...midPointYs, endY];
    const controlPoints = [...midPoints, endPoint];
    const maxForwardOffset = segmentSpacing * 0.4;
    const minGap = segmentSpacing * 0.3;
    const normalizeOffsets = (offsets?: ViperPathOffset[]) => {
      const defaultOffsets = Array.from({ length: 5 }, () => ({ x: 0, y: 0 }));
      offsets?.forEach((offset, index) => {
        if (!defaultOffsets[index]) return;
        defaultOffsets[index] = { x: offset.x ?? 0, y: offset.y ?? 0 };
      });
      return defaultOffsets;
    };
    const updatePointsFromOffsets = () => {
      const offsets = normalizeOffsets(this.viperPathOffsets[activeModeIndex]);
      controlPoints.forEach((point, index) => {
        point.x = baseX + (offsets[index]?.x ?? 0);
        point.y = basePointYs[index] + (offsets[index]?.y ?? 0);
      });
    };

    const redrawPath = () => {
      pathGraphics.clear();
      pathGraphics.lineStyle(3, 0x00e5ff, 0.8);
      pathGraphics.beginPath();
      pathGraphics.moveTo(startPoint.x, startPoint.y);
      controlPoints.forEach((point) => pathGraphics.lineTo(point.x, point.y));
      pathGraphics.strokePath();
    };

    updatePointsFromOffsets();
    redrawPath();

    const modePanelX = this.isMobileMode ? GAME_CONFIG.WIDTH * 0.68 : GAME_CONFIG.WIDTH * 0.7;
    const modePanelTop = startY - (this.isMobileMode ? 10 : 20);
    const modeTitle = this.add.text(modePanelX, modePanelTop, '弾道モード', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '16px' : '18px') : '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    modeTitle.setOrigin(0.5, 0);
    instructionElements.push(modeTitle);

    const activeModeText = this.add.text(modePanelX, modePanelTop + (this.isMobileMode ? 22 : 24), '', {
      fontSize: this.isMobileMode ? (isCompactLayout ? '14px' : '16px') : '14px',
      color: '#00e5ff',
      fontFamily: 'monospace',
    });
    activeModeText.setOrigin(0.5, 0);
    instructionElements.push(activeModeText);

    const modeButtons: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
    const modeButtonWidth = this.isMobileMode ? (isCompactLayout ? 86 : 96) : 90;
    const modeButtonHeight = this.isMobileMode ? (isCompactLayout ? 38 : 44) : 36;
    const modeButtonY = modePanelTop + (this.isMobileMode ? 60 : 64);
    const modeSpacing = this.isMobileMode ? 12 : 14;
    const totalModeWidth = modeButtonWidth * 3 + modeSpacing * 2;
    const modeStartX = modePanelX - totalModeWidth / 2 + modeButtonWidth / 2;

    const updateModeButtons = () => {
      activeModeText.setText(`設定中: 弾${activeModeIndex + 1}`);
      modeButtons.forEach((button, index) => {
        const selected = index === activeModeIndex;
        button.bg.setStrokeStyle(2, selected ? 0x00e5ff : 0x444444, selected ? 0.9 : 0.6);
        button.label.setColor(selected ? '#00e5ff' : '#aaaaaa');
      });
    };

    for (let i = 0; i < 3; i += 1) {
      const x = modeStartX + i * (modeButtonWidth + modeSpacing);
      const bg = this.add.rectangle(x, modeButtonY, modeButtonWidth, modeButtonHeight, 0x1a1a3a, 0.9);
      bg.setStrokeStyle(2, 0x444444, 0.6);
      const label = this.add.text(x, modeButtonY, `弾${i + 1}`, {
        fontSize: this.isMobileMode ? (isCompactLayout ? '14px' : '15px') : '14px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      });
      label.setOrigin(0.5);
      const selectMode = () => {
        activeModeIndex = i;
        this.viperModeIndex = i;
        updatePointsFromOffsets();
        redrawPath();
        updateModeButtons();
      };
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', selectMode);
      label.setInteractive({ useHandCursor: true }).on('pointerdown', selectMode);
      modeButtons.push({ bg, label });
      instructionElements.push(bg, label);
    }
    updateModeButtons();

    const instructionsText = this.add.text(
      modePanelX,
      modeButtonY + (this.isMobileMode ? 50 : 60),
      '左の点とゴールを左右・上下にドラッグして弾道を設定\n弾は上のスタート(発射)→下のゴール(着弾)へ進む\n戦闘中はQで弾道を切替',
      {
        fontSize: this.isMobileMode ? (isCompactLayout ? '13px' : '15px') : '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: this.isMobileMode ? (isCompactLayout ? 280 : 300) : 320 },
      }
    );
    instructionsText.setOrigin(0.5, 0);
    instructionElements.push(instructionsText);

    const dragHandler = (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.GameObject,
      dragX: number,
      dragY: number
    ) => {
      const index = controlPoints.findIndex((point) => point === gameObject);
      if (index === -1) return;
      const prevPoint = index === 0 ? startPoint : controlPoints[index - 1];
      const nextPoint = index === controlPoints.length - 1 ? null : controlPoints[index + 1];
      const baseY = basePointYs[index];
      const minY = Math.max(baseY - maxForwardOffset, prevPoint.y + minGap);
      const maxY = Math.min(
        baseY + maxForwardOffset,
        nextPoint ? nextPoint.y - minGap : baseY + maxForwardOffset
      );
      const clampedX = Phaser.Math.Clamp(dragX, baseX - maxOffset, baseX + maxOffset);
      const clampedY = Phaser.Math.Clamp(dragY, minY, maxY);
      controlPoints[index].x = clampedX;
      controlPoints[index].y = clampedY;
      const activeOffsets = normalizeOffsets(this.viperPathOffsets[activeModeIndex]);
      activeOffsets[index] = {
        x: clampedX - baseX,
        y: clampedY - baseY,
      };
      this.viperPathOffsets[activeModeIndex] = activeOffsets;
      redrawPath();
    };

    this.setInstructionsContent(instructionElements);
    this.input.on('drag', dragHandler);
    this.viperSettingsCleanup = () => {
      this.input.off('drag', dragHandler);
      controlPoints.forEach((point) => point.disableInteractive());
    };
  }

  private showCommandDetailInstructions(returnTarget: 'boss' | 'twoPlayer' = 'boss') {
    const { layoutCenterY, isCompactLayout } = this.getInstructionLayout();
    const verticalOffset = this.isMobileMode ? -10 : -30;
    const titleY = layoutCenterY - (this.isMobileMode ? 220 : 210) + verticalOffset;
    const contentY = titleY + (this.isMobileMode ? 60 : 54);

    const title = this.add.text(GAME_CONFIG.WIDTH / 2, titleY, 'コマンド・トリガーの詳細', {
      fontSize: this.isMobileMode ? '32px' : '22px',
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    title.setOrigin(0.5);

    const instructionElements: Phaser.GameObjects.GameObject[] = [title];

    const backButtonX = this.isMobileMode ? 120 : 110;
    const backButtonY = this.isMobileMode ? 70 : 60;
    const backButtonWidth = this.isMobileMode ? 200 : 150;
    const backButtonHeight = this.isMobileMode ? 60 : 44;
    const backButton = this.add.rectangle(
      backButtonX,
      backButtonY,
      backButtonWidth,
      backButtonHeight,
      0x1a1a3a,
      0.95
    );
    backButton.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    const backText = this.add.text(backButtonX, backButtonY, '戻る', {
      fontSize: this.isMobileMode ? '22px' : '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    backText.setOrigin(0.5);
    const handleBack = () => {
      if (returnTarget === 'twoPlayer') {
        this.showTwoPlayerInstructions();
        return;
      }
      this.showBossSetupInstructions();
    };
    backButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    backText.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    instructionElements.push(backButton, backText);

    const delaySwitchLine =
      returnTarget === 'twoPlayer'
        ? '・遅延弾/弾道切替：アステロイドキーは遅延、バイパーキーは弾道切替。'
        : '・遅延弾/弾道切替（Q）：アステロイドは遅延、バイパーは弾道切替。';

    const leftColumnLines = [
      '━━ コマンド解説 ━━',
      '・移動（WASDキー）：キャラクターを動かす基本操作。',
      '・エイム（マウス）：狙いたい方向へマウスを動かす。',
      '・射撃（左クリック/クリック）：弾を発射。',
      '・弾種切替（E）：選んだ3種を順に切替。',
      delaySwitchLine,
      '・固定シールド（SPACE）：正面を守る高耐久シールド。',
      '・全方位シールド（SHIFT+SPACE）：周囲を守るが耐久は低め。',
      '',
      '━━ 弾の種類と特徴 ━━',
      `アステロイド（コスト${GAME_CONFIG.ASTEROID_COST} / 威力${GAME_CONFIG.ASTEROID_TRION_DAMAGE} / 対シールド${GAME_CONFIG.ASTEROID_SHIELD_DAMAGE}）`,
      '  標準弾。低コストで数を出せる。遅延設置（Q）で3秒静止させることが可能。',
      `メテオラ（コスト${GAME_CONFIG.METEORA_COST} / 威力${GAME_CONFIG.METEORA_TRION_DAMAGE} / 対シールド${GAME_CONFIG.METEORA_SHIELD_DAMAGE}）`,
      '  爆風で範囲攻撃。シールド崩しが得意で固まっている弾の一掃にも。',
      `バイパー（コスト${GAME_CONFIG.VIPER_COST} / 威力${GAME_CONFIG.VIPER_TRION_DAMAGE} / 対シールド${GAME_CONFIG.VIPER_SHIELD_DAMAGE}）`,
      '  事前に引いた弾道で飛ぶ。戦闘中の誘導はできないが裏取りに強い。',
      '  難易度画面の「バイパー設定」から弾道を編集。',
      `レッドバレット（コスト${GAME_CONFIG.RED_BULLET_COST} / 威力${GAME_CONFIG.RED_BULLET_TRION_DAMAGE}）`,
      `  命中で移動と弾速を減速。最大${GAME_CONFIG.RED_BULLET_MAX_STACKS}回まで重ね掛け可能。2回ヒットで敵がフリーズ`,
      '',
      '━━ シールドの耐久値 ━━',
      `固定シールド：耐久${GAME_CONFIG.SHIELD_NARROW_STRENGTH}。守れるのは正面だけだが強い。`,
      `全方位シールド：耐久${GAME_CONFIG.SHIELD_WIDE_STRENGTH}。全周囲を守るが削れやすい。`,
      `※シールドはどちらも破壊されるまで張り替えられない。→固定シールド展開中は背後が隙になる`,
      '',
    ];

    const rightColumnLines = [
      '━━ 初心者向け 戦略メモ ━━',
      '・バイパーは事前に弾道を引けるので、シールドの裏を狙う動きが強い。',
      '・メテオラはシールド破壊が得意。シールドでバイパーが通らない時などに有効。',
      '・レッドバレットは2回当てると数秒フリーズ、正直かなり強い。ただ遅いので当て方が大事',
      '・レッドバレットはシールド・弾を貫通する。個人的にはレッドバレット × バイパーが好き',
      '・固定シールドは向きが変わらない。これは相手にも言えるのでチャンスになる。',
      '・固定シールドを壊さないようにして背後に回るのがコツ（全方位シールドが出せないため）',
      '・バイパー以外の弾は避け、バイパーは全方位シールドで防ぐ。敵が固定シールド展開中にバイパーで叩くのがおすすめ',
      '',
      `※数値は基準値。戦況に合わせて弾を使い分けよう。`,
    ];

    if (this.isMobileMode) {
      const commandText = [...leftColumnLines, ...rightColumnLines].join('\n');
      const commandDetail = this.add.text(GAME_CONFIG.WIDTH / 2, contentY, commandText, {
        fontSize: isCompactLayout ? '18px' : '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'left',
        lineSpacing: 10,
        wordWrap: { width: 560 },
      });
      commandDetail.setOrigin(0.5, 0);
      instructionElements.push(commandDetail);
    } else {
      const columnGap = 40;
      const columnWidth = 520;
      const totalWidth = columnWidth * 2 + columnGap;
      const leftX = GAME_CONFIG.WIDTH / 2 - totalWidth / 2;
      const rightX = leftX + columnWidth + columnGap;

      const leftText = this.add.text(leftX, contentY, leftColumnLines.join('\n'), {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'left',
        lineSpacing: 6,
        wordWrap: { width: columnWidth },
      });
      leftText.setOrigin(0, 0);

      const rightText = this.add.text(rightX, contentY, rightColumnLines.join('\n'), {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'left',
        lineSpacing: 6,
        wordWrap: { width: columnWidth },
      });
      rightText.setOrigin(0, 0);

      instructionElements.push(leftText, rightText);
    }

    this.setInstructionsContent(instructionElements, true);
  }

  private showTwoPlayerInstructions() {
    const { layoutCenterY, actionButtonWidth, actionButtonHeight } = this.getInstructionLayout();
    const titleY = layoutCenterY - (this.isMobileMode ? 220 : 220);
    const instructionGapY = this.isMobileMode ? 0 : 0;
    const leftX = this.isMobileMode ? GAME_CONFIG.WIDTH * 0.28 : GAME_CONFIG.WIDTH / 2 - 220;
    const rightX = this.isMobileMode ? GAME_CONFIG.WIDTH * 0.72 : GAME_CONFIG.WIDTH / 2 + 220;

    const title = this.add.text(GAME_CONFIG.WIDTH / 2, titleY, '2Pモード', {
      fontSize: this.isMobileMode ? '42px' : '28px',
      color: '#ffd166',
      fontFamily: 'monospace',
    });
    title.setOrigin(0.5);

    const description = this.add.text(
      GAME_CONFIG.WIDTH / 2,
      layoutCenterY - (this.isMobileMode ? 130 : 140),
      '2人対戦モード。\n相手のトリオン(体力)を0にすると勝利。\n攻撃やシールドでトリオンを消費するので、\n動きながらうまく管理しよう。',
      {
        fontSize: this.isMobileMode ? '22px' : '16px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: this.isMobileMode ? 10 : 6,
      }
    );
    description.setOrigin(0.5);

    const descriptionBounds = description.getBounds();
    const noteText = this.add.text(
      GAME_CONFIG.WIDTH / 2,
      descriptionBounds.bottom + (this.isMobileMode ? 26 : 18),
      '※遅延/弾道切替は各プレイヤー側の切替ボタンで操作できます。',
      {
        fontSize: this.isMobileMode ? '18px' : '12px',
        color: '#cccccc',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: GAME_CONFIG.WIDTH * 0.9 },
      }
    );
    noteText.setOrigin(0.5);

    const noteBounds = noteText.getBounds();
    const deviceNote = this.add.text(
      GAME_CONFIG.WIDTH / 2,
      noteBounds.bottom + (this.isMobileMode ? 18 : 12),
      '※iPad/タブレットでの操作が最も快適です。スマホは操作しづらい場合があります。',
      {
        fontSize: this.isMobileMode ? '18px' : '12px',
        color: '#cbd5f5',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: GAME_CONFIG.WIDTH * 0.9 },
      }
    );
    deviceNote.setOrigin(0.5);

    const deviceNoteBounds = deviceNote.getBounds();
    const instructionTopY = deviceNoteBounds.bottom + (this.isMobileMode ? 36 : 22);

    const playerOneText = this.add.text(
      leftX,
      instructionTopY,
      'プレイヤー1\n移動: WASD\n攻撃: F\n武器切替: Q/E\nシールド(正面): SPACE\n全方位シールド: SHIFT + SPACE',
      {
        fontSize: this.isMobileMode ? '22px' : '16px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: this.isMobileMode ? 'left' : 'left',
        lineSpacing: 6,
        wordWrap: this.isMobileMode ? { width: GAME_CONFIG.WIDTH * 0.42 } : undefined,
      }
    );
    playerOneText.setOrigin(this.isMobileMode ? 0 : 0, 0);

    const playerTwoText = this.add.text(
      rightX,
      instructionTopY + instructionGapY,
      'プレイヤー2\n移動: ↑↓←→\n攻撃: ENTER\n武器切替: O/P\nシールド(正面): SHIFT\n全方位シールド: L',
      {
        fontSize: this.isMobileMode ? '22px' : '16px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: this.isMobileMode ? 'right' : 'left',
        lineSpacing: 6,
        wordWrap: this.isMobileMode ? { width: GAME_CONFIG.WIDTH * 0.42 } : undefined,
      }
    );
    playerTwoText.setOrigin(this.isMobileMode ? 1 : 0, 0);

    const instructionBottomY = Math.max(
      playerOneText.getBounds().bottom,
      playerTwoText.getBounds().bottom
    );
    const detailButtonY = this.isMobileMode
      ? instructionBottomY + 80
      : layoutCenterY + 110;
    const startButtonY = this.isMobileMode
      ? detailButtonY + 120
      : layoutCenterY + 180;

    const backButtonX = this.isMobileMode ? 120 : 110;
    const backButtonY = this.isMobileMode ? 70 : 60;
    const backButtonWidth = this.isMobileMode ? 200 : 150;
    const backButtonHeight = this.isMobileMode ? 60 : 44;
    const backButton = this.add.rectangle(
      backButtonX,
      backButtonY,
      backButtonWidth,
      backButtonHeight,
      0x1a1a3a,
      0.95
    );
    backButton.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    const backText = this.add.text(backButtonX, backButtonY, '戻る', {
      fontSize: this.isMobileMode ? '22px' : '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    backText.setOrigin(0.5);
    const handleBack = () => {
      this.showModeSelectInstructions();
    };
    backButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    backText.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);

    const detailButtonWidth = this.isMobileMode ? actionButtonWidth : 160;
    const detailButtonX = this.isMobileMode
      ? GAME_CONFIG.WIDTH * 0.3
      : GAME_CONFIG.WIDTH / 2 - detailButtonWidth / 2 - 12;
    const viperButtonX = this.isMobileMode
      ? GAME_CONFIG.WIDTH * 0.7
      : GAME_CONFIG.WIDTH / 2 + detailButtonWidth / 2 + 12;
    const viperButtonY = detailButtonY;

    const detailButton = this.add.rectangle(
      detailButtonX,
      detailButtonY,
      detailButtonWidth,
      actionButtonHeight,
      0x1a1a3a,
      0.95
    );
    detailButton.setStrokeStyle(2, 0x4ad6ff, 0.9);
    const detailText = this.add.text(detailButtonX, detailButtonY, 'トリガーの詳細', {
      fontSize: this.isMobileMode ? '24px' : '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    detailText.setOrigin(0.5);
    const handleDetail = () => {
      this.showCommandDetailInstructions('twoPlayer');
    };
    detailButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleDetail);
    detailText.setInteractive({ useHandCursor: true }).on('pointerdown', handleDetail);

    const viperButton = this.add.rectangle(
      viperButtonX,
      viperButtonY,
      detailButtonWidth,
      actionButtonHeight,
      0x1a1a3a,
      0.95
    );
    viperButton.setStrokeStyle(2, 0x4ad6ff, 0.9);
    const viperText = this.add.text(viperButtonX, viperButtonY, 'バイパー設定', {
      fontSize: this.isMobileMode ? '24px' : '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    viperText.setOrigin(0.5);
    const handleViperSettings = () => {
      this.showViperSettingsInstructions('twoPlayer');
    };
    viperButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleViperSettings);
    viperText.setInteractive({ useHandCursor: true }).on('pointerdown', handleViperSettings);

    const startButton = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      startButtonY,
      actionButtonWidth,
      actionButtonHeight,
      0x1a1a3a,
      0.95
    );
    startButton.setStrokeStyle(3, GAME_CONFIG.BULLET_COLOR, 0.9);
    const startText = this.add.text(GAME_CONFIG.WIDTH / 2, startButtonY, 'スタート', {
      fontSize: this.isMobileMode ? '26px' : '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    startText.setOrigin(0.5);

    const handleStart = () => {
      this.scene.start('PvpScene');
    };
    startButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleStart);
    startText.setInteractive({ useHandCursor: true }).on('pointerdown', handleStart);

    const instructionElements: Phaser.GameObjects.GameObject[] = [
      title,
      description,
      noteText,
      deviceNote,
      playerOneText,
      playerTwoText,
      backButton,
      backText,
      detailButton,
      detailText,
      viperButton,
      viperText,
      startButton,
      startText,
    ];

    this.setInstructionsContent(instructionElements, true);
  }

  private startBattle() {
    if (this.gameStarted) return;
    this.gameStarted = true;
    this.battleStartTime = this.time.now;
    this.events.emit('battle-state-changed', this.gameStarted);
    this.availableBulletTypes = [...this.selectedBulletTypes];
    this.gameState.currentBulletType = this.availableBulletTypes[0] ?? 'asteroid';
    this.applyDifficultySettings();
    this.destroyInstructionsOverlay();
  }

  private startTutorial() {
    this.isTutorialMode = true;
    this.events.emit('tutorial-state-changed', this.isTutorialMode);
    this.difficulty = 'easy';
    this.selectedBulletTypes = [...AVAILABLE_BULLET_TYPES];
    this.availableBulletTypes = [...AVAILABLE_BULLET_TYPES];
    this.clearCombatEntities();
    this.resetState();
    this.resetTutorialProgress();
    this.tutorialSteps = this.buildTutorialSteps();
    this.tutorialStepIndex = 0;
    this.applyTutorialStep();
    this.gameState.currentBulletType = this.availableBulletTypes[0] ?? 'asteroid';
    this.gameStarted = true;
    this.battleStartTime = this.time.now;
    this.events.emit('battle-state-changed', this.gameStarted);
    this.applyDifficultySettings();
    this.gameOverText.setVisible(false);
    this.destroyInstructionsOverlay();
    this.boss.deactivateShield();
    this.applyMobileTutorialLayout();
    this.showTutorialOverlay();
    this.tutorialTapReady = false;
    this.time.delayedCall(200, () => {
      this.tutorialTapReady = true;
    });
  }

  private applyDifficultySettings() {
    const fireRateMultiplier = this.getEnemyFireRateMultiplier();
    this.boss.setFireRate(GAME_CONFIG.BOSS_FIRE_RATE * fireRateMultiplier);
    this.gameState.bossTrion = this.getBossMaxTrion();
  }

  private enableInstructionScroll(
    background: Phaser.GameObjects.Rectangle,
    content: Phaser.GameObjects.Container
  ) {
    const contentBounds = content.getBounds();
    const isLandscapeMobile =
      this.isMobileMode && this.scale.displaySize.width > this.scale.displaySize.height;
    const bottomPadding = this.isMobileMode ? (isLandscapeMobile ? 220 : 160) : 0;
    const topPadding = this.isMobileMode ? (isLandscapeMobile ? 40 : 20) : 0;
    const minScrollY = Math.min(0, GAME_CONFIG.HEIGHT - (contentBounds.bottom + bottomPadding));
    const maxScrollY = Math.max(0, -contentBounds.top + topPadding);

    if (minScrollY === maxScrollY) return;

    let startContentY = 0;
    let startPointerY = 0;
    let isDragging = false;
    const dragThreshold = 6;

    background.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT),
      Phaser.Geom.Rectangle.Contains
    );

    const handlePointerDown = (pointer: Phaser.Input.Pointer) => {
      startContentY = content.y;
      startPointerY = pointer.y;
      isDragging = false;
    };

    const handlePointerMove = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      const delta = pointer.y - startPointerY;
      if (Math.abs(delta) > dragThreshold) {
        isDragging = true;
      }
      if (!isDragging) return;
      content.y = Phaser.Math.Clamp(startContentY + delta, minScrollY, maxScrollY);
    };

    const handlePointerUp = () => {
      isDragging = false;
    };

    this.input.on('pointerdown', handlePointerDown);
    this.input.on('pointermove', handlePointerMove);
    this.input.on('pointerup', handlePointerUp);
    this.input.on('pointerupoutside', handlePointerUp);

    this.instructionScrollCleanup = () => {
      this.input.off('pointerdown', handlePointerDown);
      this.input.off('pointermove', handlePointerMove);
      this.input.off('pointerup', handlePointerUp);
      this.input.off('pointerupoutside', handlePointerUp);
      if (background.active && background.scene) {
        background.disableInteractive();
      }
    };
  }

  private destroyInstructionsOverlay() {
    this.instructionScrollCleanup?.();
    this.instructionScrollCleanup = undefined;
    this.viperSettingsCleanup?.();
    this.viperSettingsCleanup = undefined;
    this.instructionsContent = undefined;
    if (this.instructionsOverlay?.active) {
      this.instructionsOverlay.destroy(true);
    }
  }

  private showTutorialOverlay() {
    if (!this.tutorialHelpText) return;
    this.updateTutorialHelpText();
    this.tutorialHelpText.setVisible(true);
    this.startTutorialHelpHighlight();

    const buttonX = this.isMobileMode ? 140 : 120;
    const buttonY = this.isMobileMode ? 70 : 60;
    const buttonWidth = this.isMobileMode ? 220 : 180;
    const buttonHeight = this.isMobileMode ? 64 : 48;

    const backButton = this.add.rectangle(
      buttonX,
      buttonY,
      buttonWidth,
      buttonHeight,
      0x1a1a3a,
      0.95
    );
    backButton.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    const backText = this.add.text(buttonX, buttonY, '戻る', {
      fontSize: this.isMobileMode ? '22px' : '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    backText.setOrigin(0.5);

    const handleBack = () => {
      this.tutorialProgress.summaryAcknowledged = true;
      this.scene.restart();
    };
    backButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    backText.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);

    const viperButtonX = this.isMobileMode ? GAME_CONFIG.WIDTH - 100 : GAME_CONFIG.WIDTH - 140;
    const viperButtonY = this.isMobileMode ? 80 : 60;
    const viperButtonWidth = this.isMobileMode ? 180 : 170;
    const viperButtonHeight = this.isMobileMode ? 56 : 40;
    const viperButton = this.add.rectangle(
      viperButtonX,
      viperButtonY,
      viperButtonWidth,
      viperButtonHeight,
      0x1a1a3a,
      0.95
    );
    viperButton.setStrokeStyle(2, 0x4ad6ff, 0.9);
    const viperText = this.add.text(viperButtonX, viperButtonY, 'バイパー設定', {
      fontSize: this.isMobileMode ? '18px' : '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    viperText.setOrigin(0.5);
    const handleViperSettings = () => {
      if (!this.isTutorialMode) return;
      this.tutorialProgress.viperSettingsOpened = true;
      this.setTutorialOverlayVisible(false);
      this.showViperSettingsInstructions('tutorial');
    };
    viperButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleViperSettings);
    viperText.setInteractive({ useHandCursor: true }).on('pointerdown', handleViperSettings);
    viperButton.setVisible(false);
    viperText.setVisible(false);

    this.tutorialBackButton = backButton;
    this.tutorialBackText = backText;
    this.tutorialViperButton = viperButton;
    this.tutorialViperText = viperText;
    this.tutorialOverlay = this.add.container(0, 0, [backButton, backText, viperButton, viperText]);
    this.tutorialOverlay.setDepth(100);
    this.updateTutorialViperButtonVisibility(this.tutorialSteps[this.tutorialStepIndex]);
    this.updateTutorialFocusHighlight();
  }

  private setTutorialOverlayVisible(visible: boolean) {
    this.tutorialOverlay?.setVisible(visible);
    this.tutorialHelpText?.setVisible(visible);
    this.tutorialHelpHighlight?.setVisible(visible);
    if (!visible) {
      this.tutorialFocusHighlight?.setVisible(false);
    } else {
      this.updateTutorialHelpHighlight();
      this.updateTutorialFocusHighlight();
    }
  }

  private updateTutorialViperButtonVisibility(step?: TutorialStep) {
    if (!this.tutorialViperButton || !this.tutorialViperText) return;
    const shouldShow = Boolean(step?.requiresViperSettings);
    this.tutorialViperButton.setVisible(shouldShow);
    this.tutorialViperText.setVisible(shouldShow);
    if (shouldShow) {
      if (!this.tutorialViperButton.input?.enabled) {
        this.tutorialViperButton.setInteractive({ useHandCursor: true });
      }
      if (!this.tutorialViperText.input?.enabled) {
        this.tutorialViperText.setInteractive({ useHandCursor: true });
      }
    } else {
      this.tutorialViperButton.disableInteractive();
      this.tutorialViperText.disableInteractive();
    }
  }

  private updateTutorialHelpText() {
    if (!this.tutorialHelpText) return;
    if (this.tutorialSteps.length === 0) {
      this.tutorialHelpText.setText('');
      this.updateTutorialHelpHighlight();
      this.updateTutorialFocusHighlight();
      return;
    }
    const step = this.tutorialSteps[this.tutorialStepIndex];
    const stepNum = this.tutorialStepIndex + 1;
    const totalSteps = this.tutorialSteps.length;
    
    // Build formatted text with better visual hierarchy
    const progressBar = this.buildProgressBar(stepNum, totalSteps);
    const stepLabel = `━━ ステップ ${stepNum} / ${totalSteps} ━━`;
    
    // Format description with bullet points for clarity
    const description = step.description.map((line, idx) => {
      // First line is usually the main instruction - make it stand out
      if (idx === 0) return `▶ ${line}`;
      // Last line is often the action prompt
      if (idx === step.description.length - 1) return `→ ${line}`;
      return `  ${line}`;
    });
    
    if (step.requiredHits) {
      const filled = '●'.repeat(Math.min(this.tutorialProgress.requiredBulletHits, step.requiredHits));
      const empty = '○'.repeat(Math.max(0, step.requiredHits - this.tutorialProgress.requiredBulletHits));
      description.push(`命中: ${filled}${empty}`);
    }
    
    const textLines = [
      progressBar,
      '',
      stepLabel,
      step.title,
      '',
      ...description,
    ];
    this.tutorialHelpText.setText(textLines.join('\n'));
    this.updateTutorialHelpHighlight();
    this.updateTutorialFocusHighlight();
  }
  
  private buildProgressBar(current: number, total: number): string {
    const filled = '█'.repeat(current);
    const empty = '░'.repeat(total - current);
    return `[${filled}${empty}]`;
  }

  private updateTutorialHelpHighlight() {
    if (!this.tutorialHelpHighlight || !this.tutorialHelpText) return;
    if (!this.tutorialHelpText.visible) {
      this.tutorialHelpHighlight.setVisible(false);
      return;
    }
    const bounds = this.tutorialHelpText.getBounds();
    const padding = 10;
    this.tutorialHelpHighlight.clear();
    this.tutorialHelpHighlight.lineStyle(2, 0x2dff76, 1);
    this.tutorialHelpHighlight.strokeRect(
      bounds.x - padding,
      bounds.y - padding,
      bounds.width + padding * 2,
      bounds.height + padding * 2
    );
    this.tutorialHelpHighlight.setVisible(true);
  }

  private updateTutorialFocusHighlight() {
    if (!this.tutorialFocusHighlight) return;
    if (!this.isTutorialMode || this.tutorialSteps.length === 0) {
      this.tutorialFocusHighlight.setVisible(false);
      return;
    }
    const step = this.tutorialSteps[this.tutorialStepIndex];
    if (!step?.focusTarget) {
      this.tutorialFocusHighlight.setVisible(false);
      this.updateTutorialBackButtonGlow();
      return;
    }

    const highlight = this.tutorialFocusHighlight;
    const padding = 12;
    highlight.clear();
    highlight.lineStyle(3, 0x2dff76, 1);

    if (step.focusTarget === 'trionMeter') {
      const barWidth = 250;
      const barHeight = 24;
      const uiY = 42;
      const barX = 20;
      const width = barWidth + 90;
      const height = barHeight + 30;
      highlight.strokeRect(barX - padding, uiY - 18, width + padding * 2, height + padding * 2);
    } else if (step.focusTarget === 'triggerDisplay') {
      const bounds = this.bulletTypeText.getBounds();
      highlight.strokeRect(
        bounds.x - padding,
        bounds.y - padding,
        bounds.width + padding * 2,
        bounds.height + padding * 2
      );
    } else if (step.focusTarget === 'viperSettings') {
      if (this.tutorialProgress.viperSettingsOpened) {
        const bounds = this.bulletTypeText.getBounds();
        highlight.strokeRect(
          bounds.x - padding,
          bounds.y - padding,
          bounds.width + padding * 2,
          bounds.height + padding * 2
        );
      } else if (this.tutorialViperButton) {
        const bounds = this.tutorialViperButton.getBounds();
        highlight.strokeRect(
          bounds.x - padding,
          bounds.y - padding,
          bounds.width + padding * 2,
          bounds.height + padding * 2
        );
      }
    } else if (step.focusTarget === 'player') {
      highlight.strokeCircle(this.player.x, this.player.y, GAME_CONFIG.PLAYER_RADIUS + 28);
    } else if (step.focusTarget === 'backButton' && this.tutorialBackButton) {
      const bounds = this.tutorialBackButton.getBounds();
      highlight.strokeRect(
        bounds.x - padding,
        bounds.y - padding,
        bounds.width + padding * 2,
        bounds.height + padding * 2
      );
    }
    highlight.setVisible(true);
    this.updateTutorialBackButtonGlow(step);
  }

  private updateTutorialBackButtonGlow(step?: TutorialStep) {
    if (!this.tutorialBackButton || !this.tutorialBackText) return;
    const shouldGlow = step?.focusTarget === 'backButton';

    if (!shouldGlow) {
      if (this.tutorialBackButtonTween) {
        this.tutorialBackButtonTween.stop();
        this.tutorialBackButtonTween = undefined;
      }
      this.tutorialBackButton.setAlpha(1);
      this.tutorialBackText.setAlpha(1);
      this.tutorialBackButton.setScale(1);
      this.tutorialBackText.setScale(1);
      return;
    }

    if (this.tutorialBackButtonTween) return;
    this.tutorialBackButton.setScale(1);
    this.tutorialBackText.setScale(1);
    this.tutorialBackButton.setAlpha(0.4);
    this.tutorialBackText.setAlpha(0.4);
    this.tutorialBackButtonTween = this.tweens.add({
      targets: [this.tutorialBackButton, this.tutorialBackText],
      alpha: 1,
      scale: 1.06,
      duration: 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private startTutorialHelpHighlight() {
    if (!this.tutorialHelpHighlight) return;
    this.tutorialHelpHighlight.setAlpha(0.3);
    if (this.tutorialHelpHighlightTween) return;
    this.tutorialHelpHighlightTween = this.tweens.add({
      targets: this.tutorialHelpHighlight,
      alpha: 1,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    if (!this.tutorialFocusHighlight) return;
    this.tutorialFocusHighlight.setAlpha(0.3);
    if (this.tutorialFocusHighlightTween) return;
    this.tutorialFocusHighlightTween = this.tweens.add({
      targets: this.tutorialFocusHighlight,
      alpha: 1,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private buildTutorialSteps(): TutorialStep[] {
    const slowPercent = Math.round(GAME_CONFIG.RED_BULLET_SLOW_MULTIPLIER * 100);
    const enemyBulletSlowPercent = Math.round(GAME_CONFIG.RED_BULLET_ENEMY_BULLET_SPEED_MULTIPLIER * 100);
    return [
      {
        title: 'トリオン / トリガーって何？',
        description: [
          'トリオン = 体力＆エネルギー',
          '撃つ/シールド/被弾で減る',
          '0で敗北、時間で少し回復',
          'トリガー = 装備中の弾の種類',
          '画面をタップ/クリックで次へ',
        ],
        isCompleted: () => this.tutorialProgress.introAcknowledged,
        focusTarget: 'trionMeter',
      },
      {
        title: 'Step2 移動',
        description: [
          'W/A/S/D で動けるよ',
          '（スマホは画面左スティック）',
          '1回だけ動いてみよう',
        ],
        isCompleted: () => this.tutorialProgress.moved,
        focusTarget: 'player',
      },
      {
        title: 'Step3 射撃',
        description: [
          '左クリックで撃てるよ',
          '（スマホは攻撃ボタン）',
          '1発撃ってみよう',
        ],
        isCompleted: () => this.tutorialProgress.fired,
        focusTarget: 'player',
      },
      {
        title: 'Step4 シールド',
        description: [
          'キーボードの SPACE でシールド',
          '（スマホはシールドボタン）',
          'シールドを出して弾を受けよう',
          'シールドもトリオン消費',
        ],
        requiredShieldType: 'narrow',
        
        requiresShieldBreak: true,
isCompleted: () => this.tutorialProgress.shieldBroken,
focusTarget: 'player',
},
{
  title: 'Step5 全方位シールド',
  description: [
    'SHIFT + SPACE で全方位シールド',
    '（スマホは全方位シールドボタン）',
    '全方位シールドで弾を受けよう',
    '弾を受けて消えたら次へ',
  ],
  requiredShieldType: 'wide',
  requiresShieldBreak: true,
  isCompleted: () => this.tutorialProgress.wideShieldBroken,
  focusTarget: 'player',
},
      {
        title: 'Step6 アステロイド',
        description: [
          '低コスト・連射向き',
          `コスト${GAME_CONFIG.ASTEROID_COST} / 威力${GAME_CONFIG.ASTEROID_TRION_DAMAGE}`,
          'アステロイドで10発当てよう',
        ],
        requiredBulletType: 'asteroid',
        requiredHits: 10,
        isCompleted: () => this.tutorialProgress.requiredBulletHits >= 10,
        focusTarget: 'triggerDisplay',
      },
      {
        title: 'Step7 アステロイド 遅延弾',
        description: [
          'Qで遅延弾（3秒遅れて発射される）モードに切替',
          '（スマホは遅延ボタン）',
          'アステロイドのみ遅延弾が使用可能',
          '遅延: オン を確認',
          '遅延アステロイドで1発当てよう',
        ],
        onEnter: () => {
          if (this.gameState.delayedAsteroidEnabled) {
            this.tutorialProgress.delayedAsteroidToggled = true;
          }
        },
        requiredBulletType: 'asteroid',
        requiredHits: 1,
        requiresDelayToggle: true,
        isCompleted: () =>
          this.tutorialProgress.delayedAsteroidToggled &&
          this.tutorialProgress.requiredBulletHits >= 1,
        focusTarget: 'triggerDisplay',
      },
      {
        title: 'Step8 メテオラ',
        description: [
          'キーボードの E で弾種を切替',
          '（スマホは弾切替ボタン）',
          'Eでメテオラに切替',
          '爆発で範囲攻撃・コスト高め・シールドを割りやすい',
          `コスト${GAME_CONFIG.METEORA_COST} / 威力${GAME_CONFIG.METEORA_TRION_DAMAGE}`,
          'メテオラで10発当てよう',
        ],
        requiredBulletType: 'meteora',
        requiredHits: 10,
        isCompleted: () => this.tutorialProgress.requiredBulletHits >= 10,
        focusTarget: 'triggerDisplay',
        requiresSwitch: true,
      },
      {
        title: 'Step9 バイパー',
        description: [
          '右端の「バイパー設定」を押して弾道を調整',
          '戻ったらQで弾1/2/3を切替できる',
          '正面はノーマルシールドで弾が通らない',
          `コスト${GAME_CONFIG.VIPER_COST} / 威力${GAME_CONFIG.VIPER_TRION_DAMAGE}`,
          'Eでバイパーに切替',
          'バイパーの弾1/2/3を全部当てよう',
        ],
        requiredBulletType: 'viper',
        requiredHits: 3,
        isCompleted: () =>
          this.tutorialProgress.viperSettingsOpened &&
          this.tutorialProgress.requiredBulletHits >= 3,
        focusTarget: 'viperSettings',
        requiresViperSettings: true,
        requiresViperModeHits: true,
        enemyShieldType: 'narrow',
        requiresSwitch: true,
      },
      {
        title: 'Step10 レッドバレット',
        description: [
          '低ダメージだがスロー付与',
          `移動速度${slowPercent}% / 敵弾速度${enemyBulletSlowPercent}%`,
          `最大${GAME_CONFIG.RED_BULLET_MAX_STACKS}スタックで継続・2発当てると相手がフリーズ・シールド、弾透過`,
          `コスト${GAME_CONFIG.RED_BULLET_COST} / 威力${GAME_CONFIG.RED_BULLET_TRION_DAMAGE}`,
          'Eでレッドバレットに切替',
          '相手は左右にゆっくり動くのでスローを見てみよう',
          'レッドバレットで5発当てよう',
        ],
        requiredBulletType: 'red',
        requiredHits: 5,
        isCompleted: () => this.tutorialProgress.requiredBulletHits >= 5,
        focusTarget: 'triggerDisplay',
        requiresSwitch: true,
        enemyShieldType: 'wide',
        enemyMovement: 'sideToSide',
      },
      {
        title: 'Step11 ハウンド',
        description: [
          '曲がりながら追尾する弾',
          `コスト${GAME_CONFIG.HOUND_COST} / 威力${GAME_CONFIG.HOUND_TRION_DAMAGE}`,
          'Eでハウンドに切替',
          '全面シールド相手に軌道を見てみよう',
          'ハウンドで3発当てよう',
        ],
        requiredBulletType: 'hound',
        requiredHits: 3,
        isCompleted: () => this.tutorialProgress.requiredBulletHits >= 3,
        focusTarget: 'triggerDisplay',
        requiresSwitch: true,
        countShieldHits: true,
        enemyShieldType: 'wide',
      },
      {
        title: 'Step12 トリオン勝敗',
        description: [
          'トリオン0で敗北',
          'トリオンは撃つ/守る/被弾で減る',
          'トリオンは時間で回復する',
          'チュートリアルは左上の戻るボタンで終了！頑張ってね～！',
        ],
        isCompleted: () => this.tutorialProgress.summaryAcknowledged,
        focusTarget: 'backButton',
      },
    ];
  }

  private applyTutorialStep() {
    this.resetTutorialStepFlags();
    const step = this.tutorialSteps[this.tutorialStepIndex];
    step?.onEnter?.();
    this.setupTutorialEnemy(step);
    this.updateTutorialHelpText();
    this.updateTutorialViperButtonVisibility(step);
  }

  private resetTutorialProgress() {
    this.tutorialProgress = {
      introAcknowledged: false,
      moved: false,
      fired: false,
      shieldDeployed: false,
      shieldBroken: false,
      wideShieldDeployed: false,
      wideShieldBroken: false,
      switched: false,
      requiredBulletHits: 0,
      delayedAsteroidToggled: false,
      viperSettingsOpened: false,
      viperModeHits: [false, false, false],
      summaryAcknowledged: false,
    };
    this.stopTutorialShieldFire();
  }

  private resetTutorialStepFlags() {
    this.tutorialProgress.introAcknowledged = false;
    this.tutorialProgress.moved = false;
    this.tutorialProgress.fired = false;
    this.tutorialProgress.shieldDeployed = false;
    this.tutorialProgress.shieldBroken = false;
    this.tutorialProgress.wideShieldDeployed = false;
    this.tutorialProgress.wideShieldBroken = false;
    this.tutorialProgress.switched = false;
    this.tutorialProgress.requiredBulletHits = 0;
    this.tutorialProgress.delayedAsteroidToggled = false;
    this.tutorialProgress.viperSettingsOpened = false;
    this.tutorialProgress.viperModeHits = [false, false, false];
    this.tutorialProgress.summaryAcknowledged = false;
    this.stopTutorialShieldFire();
  }

  private setupTutorialEnemy(step?: TutorialStep) {
    if (!step) return;
    this.boss.applySlow(0, 1);
    this.tutorialEnemyMovement = step.enemyMovement ?? 'none';
    if (this.tutorialEnemyMovement === 'sideToSide') {
      this.tutorialEnemyMovementTimer = 0;
      this.tutorialEnemyBaseX = this.boss.x;
    }
    if (step.enemyShieldType) {
      this.ensureBossShield(step.enemyShieldType);
    } else {
      this.boss.deactivateShield();
    }
  }

  private registerTutorialTap() {
    if (!this.isTutorialMode || this.tutorialSteps.length === 0) return;
    if (!this.tutorialTapReady) return;
    if (this.tutorialStepIndex === 0) {
      this.tutorialProgress.introAcknowledged = true;
    }
    if (this.tutorialStepIndex === this.tutorialSteps.length - 1) {
      const step = this.tutorialSteps[this.tutorialStepIndex];
      if (step?.focusTarget === 'backButton') {
        return;
      }
      this.tutorialProgress.summaryAcknowledged = true;
    }
  }

  private advanceTutorialStep() {
    if (this.tutorialStepIndex >= this.tutorialSteps.length - 1) return;
    this.tutorialStepIndex += 1;
    this.applyTutorialStep();
  }

  private updateTutorialProgress() {
    if (!this.isTutorialMode || this.tutorialSteps.length === 0) return;
    this.registerTutorialMovement();
    const step = this.tutorialSteps[this.tutorialStepIndex];
    if (step?.isCompleted()) {
      this.advanceTutorialStep();
    }
  }

  private registerTutorialSwitch() {
    if (!this.isTutorialMode || this.tutorialSteps.length === 0) return;
    const step = this.tutorialSteps[this.tutorialStepIndex];
    if (!step?.requiresSwitch) return;
    if (!step.requiredBulletType) {
      this.tutorialProgress.switched = true;
      return;
    }
    if (this.gameState.currentBulletType === step.requiredBulletType) {
      this.tutorialProgress.switched = true;
    }
  }

  private registerTutorialBulletHit(
    bulletType: BulletType,
    hitShield = false,
    viperModeIndex?: number
  ) {
    if (!this.isTutorialMode || this.tutorialSteps.length === 0) return;
    const step = this.tutorialSteps[this.tutorialStepIndex];
    if (!step?.requiredBulletType || !step.requiredHits) return;
    if (hitShield && !step.countShieldHits) return;
    if (step.requiresSwitch && !this.tutorialProgress.switched) return;
    if (step.requiresDelayToggle && !this.gameState.delayedAsteroidEnabled) return;
    if (step.requiresViperSettings && !this.tutorialProgress.viperSettingsOpened) return;
    if (bulletType !== step.requiredBulletType) return;
    if (step.requiresViperModeHits && bulletType === 'viper') {
      const modeIndex = Phaser.Math.Clamp(
        viperModeIndex ?? this.viperModeIndex,
        0,
        this.tutorialProgress.viperModeHits.length - 1
      );
      this.tutorialProgress.viperModeHits[modeIndex] = true;
      this.tutorialProgress.requiredBulletHits = this.tutorialProgress.viperModeHits.filter(Boolean).length;
    } else {
      this.tutorialProgress.requiredBulletHits = Math.min(
        step.requiredHits,
        this.tutorialProgress.requiredBulletHits + 1
      );
    }
    this.updateTutorialHelpText();
  }

  private startTutorialShieldTrial(shield: Shield) {
    if (this.tutorialShieldFireActive) return;
    this.tutorialShieldFireActive = true;
    const damageScale = this.getDamageScale();
    const delayStep = 280;

    const fireBullet = () => {
      if (!this.playerShield?.active) {
        this.stopTutorialShieldFire();
        return;
      }
      const step = this.tutorialSteps[this.tutorialStepIndex];
      if (!step?.requiresShieldBreak || step.requiredShieldType !== shield.type) {
        this.stopTutorialShieldFire();
        return;
      }
      const { startX, startY, angle } = this.getTutorialShieldFireData(shield);
      const bullet = new Bullet(
        this,
        startX,
        startY,
        angle,
        'asteroid',
        false,
        GAME_CONFIG.ASTEROID_TRION_DAMAGE * damageScale,
        GAME_CONFIG.ASTEROID_SHIELD_DAMAGE * damageScale,
        GAME_CONFIG.BOSS_BULLET_SPEED * GAME_CONFIG.ASTEROID_SPEED_MULTIPLIER
      );
      this.bossBullets.push(bullet);
      this.trimBulletPool(this.bossBullets, this.maxBossBullets);
    };

    fireBullet();
    this.tutorialShieldFireEvent = this.time.addEvent({
      delay: delayStep,
      callback: fireBullet,
      loop: true,
    });
  }

  private getTutorialShieldFireData(shield: Shield) {
    if (shield.type === 'narrow') {
      const distance = 140;
      return {
        startX: shield.x + Math.cos(shield.angle) * distance,
        startY: shield.y + Math.sin(shield.angle) * distance,
        angle: shield.angle + Math.PI,
      };
    }
    const angle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, this.player.x, this.player.y);
    return {
      startX: this.boss.x,
      startY: this.boss.y,
      angle,
    };
  }

  private registerTutorialShieldBreak(shieldType: ShieldType) {
    if (!this.isTutorialMode || this.tutorialSteps.length === 0) return;
    const step = this.tutorialSteps[this.tutorialStepIndex];
    if (!step?.requiresShieldBreak || step.requiredShieldType !== shieldType) return;
    if (shieldType === 'wide') {
      this.tutorialProgress.wideShieldBroken = true;
    } else {
      this.tutorialProgress.shieldBroken = true;
    }
    this.stopTutorialShieldFire();
    this.updateTutorialHelpText();
  }

  private stopTutorialShieldFire() {
    if (this.tutorialShieldFireEvent) {
      this.tutorialShieldFireEvent.remove(false);
      this.tutorialShieldFireEvent = undefined;
    }
    this.tutorialShieldFireActive = false;
  }

  private ensureBossShield(type: ShieldType) {
    if (this.boss.shieldActive && this.boss.shield && this.boss.shield.type === type) {
      return;
    }
    this.boss.deactivateShield();
    const aimAngle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, this.player.x, this.player.y);
    this.boss.shield = new Shield(this, this.boss.x, this.boss.y, aimAngle, type, this.boss.getRadius());
    this.boss.shieldActive = true;
  }

  private registerTutorialMovement() {
    if (this.tutorialProgress.moved) return;
    const moved =
      this.wKey.isDown ||
      this.aKey.isDown ||
      this.sKey.isDown ||
      this.dKey.isDown ||
      this.mobileInput.moveX !== 0 ||
      this.mobileInput.moveY !== 0;
    if (moved) {
      this.tutorialProgress.moved = true;
    }
  }

  private canFire(time: number = this.time.now) {
    if (!this.gameStarted) return false;
    return time - this.battleStartTime >= this.fireDelayMs;
  }

  private clearCombatEntities() {
    this.playerBullets.forEach(bullet => bullet.destroy());
    this.bossBullets.forEach(bullet => bullet.destroy());
    this.playerBullets.length = 0;
    this.bossBullets.length = 0;
    if (this.playerShield) {
      this.playerShield.destroy();
    }
    this.playerShield = null;
    this.extraEnemies.forEach(enemy => enemy.boss.destroy());
    this.extraEnemies.length = 0;
  }

  private resetState() {
    this.gameState = {
      playerTrion: GAME_CONFIG.PLAYER_TRION_MAX,
      bossTrion: this.getBossMaxTrion(),

      currentBulletType: this.availableBulletTypes[0] ?? 'asteroid',

      delayedAsteroidEnabled: false,
      isGameOver: false,
      playerWon: false,
      availableBulletTypes: [...this.availableBulletTypes],
    };
    this.spawnedShieldedEnemy = false;
    this.spawnedRapidEnemy = false;
    this.lastFireTime = 0;

    this.gameOverText.setVisible(false);
  }

  update(time: number, delta: number) {
    if (this.gameState.isGameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
        this.scene.restart();
      }
      return;
    }

    if (!this.gameStarted) {
      return;
    }
    
    // Handle restart
    if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
      this.scene.restart();
      return;
    }
    
    // Handle input
    this.handleInput();

    if (this.isTutorialMode) {
      this.updateTutorialProgress();
    }
    
    // Regenerate Trion
    this.regenerateTrion(delta);

    // Update entities
    this.player.update(delta, this.mobileInput);
    if (this.isTutorialMode) {
      this.updateTutorialEnemyBehavior(delta, time);
    } else if (this.gameState.bossTrion > 0) {
      this.boss.update(delta, this.player.x, this.player.y, time);
      // Boss firing
      this.fireEnemy(
        { boss: this.boss, trion: this.gameState.bossTrion, maxTrion: this.getBossMaxTrion(), behavior: this.getPrimaryBossBehavior() },
        time
      );
    }

    if (!this.isTutorialMode) {
      for (const enemy of this.extraEnemies) {
        if (enemy.trion <= 0) continue;
        enemy.boss.update(delta, this.player.x, this.player.y, time);
        this.fireEnemy(enemy, time);
      }
    }
    
    // Update bullets
    this.updateBullets(delta);
    
    // Update shield
    if (this.playerShield?.active) {
      this.playerShield.update(this.player.x, this.player.y, this.player.angle);
    }
    
    // Check collisions
    this.checkCollisions();

    if (!this.isTutorialMode) {
      this.cleanupDefeatedEnemies();
      this.handleBossProgression();
    }
    
    // Update UI
    this.updateUI();
    
    // Check win/lose conditions
    if (!this.isTutorialMode) {
      this.checkGameOver();
    }
  }

  private handleInput() {
    // Toggle asteroid delay mode / cycle viper trajectory
    if (Phaser.Input.Keyboard.JustDown(this.qKey)) {
      if (this.gameState.currentBulletType === 'viper') {
        this.cycleViperMode();
      } else if (this.gameState.currentBulletType === 'asteroid') {
        this.toggleDelayedAsteroidMode();
      }
    }
    
    // Switch bullet type (cycle through selected types)
    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      const types = this.availableBulletTypes;
      const currentIndex = types.indexOf(this.gameState.currentBulletType);
      if (types.length > 0) {
        this.gameState.currentBulletType = types[(currentIndex + 1) % types.length];
        this.registerTutorialSwitch();
      }
    }
    
    // Deploy shield
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.tryDeployShield();
    }

    // Continuous fire while holding (except for viper/hound which fires on click)
    const isDesktopFiring = this.input.activePointer.isDown && !this.input.activePointer.rightButtonDown();
    const isMobileFiring = this.mobileInput.attacking;
    
    if (isDesktopFiring || isMobileFiring) {
      if (this.gameState.currentBulletType !== 'viper' && this.gameState.currentBulletType !== 'hound') {
        this.tryFireBullet();
      } else if (isMobileFiring) {
        // Allow viper/hound to fire on mobile hold
        this.tryFireBullet();
      }
    }
  }

  private tryFireBullet() {
    if (!this.canFire()) return;
    const now = this.time.now;
    const fireInterval = 1000 / GAME_CONFIG.FIRE_RATE;
    
    if (now - this.lastFireTime < fireInterval) return;
    
    const bulletType = this.gameState.currentBulletType;
    let cost: number;
    
    if (bulletType === 'asteroid') {
      cost = GAME_CONFIG.ASTEROID_COST;
    } else if (bulletType === 'meteora') {
      cost = GAME_CONFIG.METEORA_COST;
    } else if (bulletType === 'viper') {
      cost = GAME_CONFIG.VIPER_COST;
    } else if (bulletType === 'hound') {
      cost = GAME_CONFIG.HOUND_COST;
    } else {
      cost = GAME_CONFIG.RED_BULLET_COST;
    }
    
    // Check if enough Trion
    if (this.gameState.playerTrion < cost) return;
    
    // Consume Trion
    this.gameState.playerTrion -= cost;
    this.lastFireTime = now;
    
    const aim = this.player.getAimDirection();
    const aimTarget = this.isMobileMode ? this.getClosestEnemyPosition() : null;
    const baseAngle = aimTarget
      ? Math.atan2(aimTarget.y - this.player.y, aimTarget.x - this.player.x)
      : Math.atan2(aim.y, aim.x);
    const fireDirection = aimTarget
      ? { x: Math.cos(baseAngle), y: Math.sin(baseAngle) }
      : aim;
    const bulletSpeedMultiplier = this.player.getBulletSpeedMultiplier(now);
    
    const damageScale = this.getDamageScale();
    let bullet: Bullet;
    if (bulletType === 'asteroid') {
      const asteroidDamage = this.gameState.delayedAsteroidEnabled
        ? GAME_CONFIG.ASTEROID_DELAY_TRION_DAMAGE
        : GAME_CONFIG.ASTEROID_TRION_DAMAGE;
      bullet = new Bullet(
        this,
        this.player.x + fireDirection.x * 20,
        this.player.y + fireDirection.y * 20,
        baseAngle,
        'asteroid',
        true,
        asteroidDamage * damageScale,
        GAME_CONFIG.ASTEROID_SHIELD_DAMAGE * damageScale,
        GAME_CONFIG.BULLET_SPEED * GAME_CONFIG.ASTEROID_SPEED_MULTIPLIER * bulletSpeedMultiplier
      );
    } else if (bulletType === 'meteora') {
      bullet = new Bullet(
        this,
        this.player.x + fireDirection.x * 20,
        this.player.y + fireDirection.y * 20,
        baseAngle,
        'meteora',
        true,
        GAME_CONFIG.METEORA_TRION_DAMAGE * damageScale,
        GAME_CONFIG.METEORA_SHIELD_DAMAGE * damageScale,
        GAME_CONFIG.BULLET_SPEED * bulletSpeedMultiplier
      );
    } else if (bulletType === 'viper') {
      // Viper - pre-set trajectory bullet
      const viperPath = this.buildViperPathPoints(
        this.player.x + fireDirection.x * 20,
        this.player.y + fireDirection.y * 20,
        baseAngle
      );
      bullet = new Bullet(
        this,
        this.player.x + fireDirection.x * 20,
        this.player.y + fireDirection.y * 20,
        baseAngle,
        'viper',
        true,
        GAME_CONFIG.VIPER_TRION_DAMAGE * damageScale,
        GAME_CONFIG.VIPER_SHIELD_DAMAGE * damageScale,
        GAME_CONFIG.VIPER_SPEED * bulletSpeedMultiplier,
        viperPath,
        this.viperModeIndex
      );
    } else if (bulletType === 'hound') {
      // Hound - guided bullet
      bullet = new Bullet(
        this,
        this.player.x + fireDirection.x * 20,
        this.player.y + fireDirection.y * 20,
        baseAngle,
        'hound',
        true,
        GAME_CONFIG.HOUND_TRION_DAMAGE * damageScale,
        GAME_CONFIG.HOUND_SHIELD_DAMAGE * damageScale,
        GAME_CONFIG.HOUND_SPEED * bulletSpeedMultiplier
      );
    } else {
      bullet = new Bullet(
        this,
        this.player.x + fireDirection.x * 20,
        this.player.y + fireDirection.y * 20,
        baseAngle,
        'red',
        true,
        GAME_CONFIG.RED_BULLET_TRION_DAMAGE * damageScale,
        GAME_CONFIG.RED_BULLET_SHIELD_DAMAGE * damageScale,
        GAME_CONFIG.RED_BULLET_SPEED * bulletSpeedMultiplier
      );
    }
    this.playerBullets.push(bullet);
    this.trimBulletPool(this.playerBullets, this.maxPlayerBullets);
    if (this.isTutorialMode) {
      this.tutorialProgress.fired = true;
    }
    if (bulletType === 'asteroid' && this.gameState.delayedAsteroidEnabled) {
      this.scheduleDelayedRelease(bullet, () => this.getClosestEnemyPosition(), 3000);
    }
  }

  private buildViperPathPoints(startX: number, startY: number, angle: number) {
    const offsets = this.getViperPathOffsets(this.viperModeIndex);
    if (offsets.length === 0) return undefined;
    const segmentLength = GAME_CONFIG.VIPER_PATH_SEGMENT_LENGTH;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const perpX = -dirY;
    const perpY = dirX;
    const points: { x: number; y: number }[] = [];
    offsets.forEach((offset, index) => {
      const distance = segmentLength * (index + 1) + offset.y;
      points.push({
        x: startX + dirX * distance + perpX * offset.x,
        y: startY + dirY * distance + perpY * offset.x,
      });
    });
    return points;
  }

  private getViperPathOffsets(modeIndex: number) {
    const offsets = this.viperPathOffsets[modeIndex] ?? [];
    if (offsets.length === 0) return [];
    const normalized = Array.from({ length: 5 }, (_, index) => offsets[index] ?? { x: 0, y: 0 });
    return normalized.map((offset) => ({ x: offset.x ?? 0, y: offset.y ?? 0 }));
  }

  private tryDeployShield() {
    // Check cooldown (only one shield at a time)
    if (this.playerShield) {
      const spriteActive = this.playerShield.sprite?.active ?? false;
      if (!this.playerShield.active || !spriteActive) {
        this.playerShield = null;
      }
    }
    if (this.playerShield?.active) return;
    
    // Check Trion
    if (this.gameState.playerTrion < GAME_CONFIG.SHIELD_COST) return;
    
    // Consume Trion
    this.gameState.playerTrion -= GAME_CONFIG.SHIELD_COST;
    
    const shieldType = this.shiftKey.isDown ? 'wide' : 'narrow';
    this.playerShield = new Shield(this, this.player.x, this.player.y, this.player.angle, shieldType, GAME_CONFIG.PLAYER_RADIUS);
    if (this.isTutorialMode) {
      const step = this.tutorialSteps[this.tutorialStepIndex];
      if (step?.requiresShieldBreak && step.requiredShieldType === shieldType && this.playerShield) {
        if (shieldType === 'wide') {
          this.tutorialProgress.wideShieldDeployed = true;
        } else {
          this.tutorialProgress.shieldDeployed = true;
        }
        this.startTutorialShieldTrial(this.playerShield);
        this.updateTutorialHelpText();
      }
    }
  }

  private toggleDelayedAsteroidMode() {
    this.gameState.delayedAsteroidEnabled = !this.gameState.delayedAsteroidEnabled;
    if (this.isTutorialMode) {
      const step = this.tutorialSteps[this.tutorialStepIndex];
      if (step?.requiresDelayToggle && this.gameState.delayedAsteroidEnabled) {
        this.tutorialProgress.delayedAsteroidToggled = true;
        this.updateTutorialHelpText();
      }
    }
  }

  private cycleViperMode() {
    const modeCount = this.viperPathOffsets.length;
    if (modeCount === 0) return;
    this.viperModeIndex = (this.viperModeIndex + 1) % modeCount;
  }

  private applyMobileTutorialLayout() {
    if (!this.isMobileMode) return;
    const tutorialX = GAME_CONFIG.WIDTH * 0.34;
    this.player.x = tutorialX;
    this.player.sprite.setPosition(this.player.x, this.player.y);
    this.boss.x = tutorialX;
    this.boss.sprite.setPosition(this.boss.x, this.boss.y);
  }

  private updateTutorialEnemyBehavior(delta: number, time: number) {
    const step = this.tutorialSteps[this.tutorialStepIndex];
    if (!step) return;

    this.boss.updateSlowVisuals(time);
    const speedMultiplier = this.boss.getMovementSpeedMultiplier(time);

    if (this.tutorialEnemyMovement === 'sideToSide') {
      this.tutorialEnemyMovementTimer += delta * speedMultiplier;
      const phase = this.tutorialEnemyMovementTimer * 0.002;
      const amplitude = 120;
      const offset = Math.sin(phase) * amplitude;
      const baseX = this.tutorialEnemyBaseX || this.boss.x;
      const padding = this.boss.getRadius() + 100;
      this.boss.x = Phaser.Math.Clamp(baseX + offset, padding, GAME_CONFIG.WIDTH - padding);
    }

    this.boss.sprite.setPosition(this.boss.x, this.boss.y);

    if (step.enemyShieldType) {
      this.ensureBossShield(step.enemyShieldType);
    }
    if (this.boss.shieldActive && this.boss.shield) {
      const aimAngle = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, this.player.x, this.player.y);
      if (this.boss.shield.type === 'narrow') {
        this.boss.shield.angle = aimAngle;
        if (this.boss.shield.sprite instanceof Phaser.GameObjects.Rectangle) {
          this.boss.shield.sprite.setRotation(aimAngle);
        }
      }
      this.boss.shield.update(this.boss.x, this.boss.y, aimAngle);
    }
  }

  private scheduleDelayedRelease(
    bullet: Bullet,
    getTarget: () => { x: number; y: number },
    delayMs: number
  ) {
    if (!bullet.active || bullet.releaseScheduled) return;
    bullet.hold();
    bullet.releaseScheduled = true;
    this.time.delayedCall(delayMs, () => {
      if (!bullet.active || !bullet.isHeld) return;
      const target = getTarget();
      bullet.releaseTowards(target.x, target.y);
    });
  }

  private trimBulletPool(bullets: Bullet[], maxBullets: number) {
    const overflow = bullets.length - maxBullets;
    if (overflow <= 0) return;
    for (let i = 0; i < overflow; i += 1) {
      bullets[i].destroy();
    }
    bullets.splice(0, overflow);
  }


  private handleBossProgression() {
    if (this.difficulty === 'easy') {
      return;
    }
    if (!this.spawnedShieldedEnemy && this.gameState.bossTrion <= 0) {
      this.spawnedShieldedEnemy = true;
      this.spawnShieldedEnemy();
      return;
    }
    if (this.difficulty === 'hard' && this.spawnedShieldedEnemy && !this.spawnedRapidEnemy && this.extraEnemies.length === 0) {
      this.spawnedRapidEnemy = true;
      this.spawnRapidEnemy();
    }
  }

  private spawnShieldedEnemy() {
    const fireRateMultiplier = this.getEnemyFireRateMultiplier();
    const config: Partial<BossConfig> = {
      speed: GAME_CONFIG.BOSS_SPEED * 0.95,
      fireRate: GAME_CONFIG.BOSS_FIRE_RATE * 1.25 * fireRateMultiplier,
      bulletSpeed: GAME_CONFIG.BOSS_BULLET_SPEED * 1.1,
      shieldCooldown: 1400,
      color: 0xffa94d,
    };
    const boss = new Boss(this, GAME_CONFIG.WIDTH * 0.25, 200, config);
    this.extraEnemies.push({
      boss,
      trion: GAME_CONFIG.BOSS_TRION_MAX + 15,
      maxTrion: GAME_CONFIG.BOSS_TRION_MAX + 15,
      behavior: {
        pattern: 'delayedAsteroid',
        delayedShotChance: 0.85,
        redShotChance: 0.15,
      },
    });
  }

  private spawnRapidEnemy() {
    const fireRateMultiplier = this.getEnemyFireRateMultiplier();
    const config: Partial<BossConfig> = {
      speed: GAME_CONFIG.BOSS_SPEED * 1.6,
      fireRate: GAME_CONFIG.BOSS_FIRE_RATE * 1.2 * fireRateMultiplier,
      bulletSpeed: GAME_CONFIG.BOSS_BULLET_SPEED * 1.3,
      shieldCooldown: 2200,
      color: 0xff6bf0,
    };
    const boss = new Boss(this, GAME_CONFIG.WIDTH * 0.75, 220, config);
    this.extraEnemies.push({
      boss,
      trion: GAME_CONFIG.BOSS_TRION_MAX + 30,
      maxTrion: GAME_CONFIG.BOSS_TRION_MAX + 30,
      behavior: {
        pattern: 'meteoraBarrage',
        delayedShotChance: 0.15,
        houndIntervalMs: 10000,
      },
      lastHoundTime: this.time.now,
    });
  }

  private getEnemyTargets(): EnemyTarget[] {
    const targets: EnemyTarget[] = [];
    if (this.gameState.bossTrion > 0 || this.isTutorialMode) {
      targets.push({
        boss: this.boss,
        getTrion: () => this.gameState.bossTrion,
        setTrion: (value: number) => {
          this.gameState.bossTrion = Math.max(0, value);
        },
        maxTrion: this.getBossMaxTrion(),
      });
    }

    for (const enemy of this.extraEnemies) {
      if (enemy.trion <= 0) continue;
      targets.push({
        boss: enemy.boss,
        getTrion: () => enemy.trion,
        setTrion: (value: number) => {
          enemy.trion = Math.max(0, value);
        },
        maxTrion: enemy.maxTrion,
      });
    }

    return targets;
  }

  private getClosestEnemyPosition() {
    const targets = this.getEnemyTargets();
    if (targets.length === 0) {
      return { x: this.player.x, y: this.player.y };
    }
    let closest = targets[0];
    let closestDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, closest.boss.x, closest.boss.y);
    for (const target of targets.slice(1)) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.boss.x, target.boss.y);
      if (dist < closestDist) {
        closest = target;
        closestDist = dist;
      }
    }
    return { x: closest.boss.x, y: closest.boss.y };
  }

  private getPrimaryBossBehavior(): EnemyBehavior {
    return {
      pattern: 'mixed',
      delayedShotChance: 0.3,
      bulletWeights: { asteroid: 0.4, meteora: 0.3, viper: 0.2, hound: 0.1, red: 0 },
    };
  }

  private getEnemyFireRateMultiplier() {
    if (this.difficulty === 'easy') {
      return 0.5;
    }
    if (this.difficulty === 'hard') {
      return 2;
    }
    return 1;
  }

  private fireEnemy(enemy: EnemyEntry, time: number) {
    if (!this.canFire(time)) return;
    const fireData = enemy.boss.fire(time);
    if (!fireData) return;

    const behavior = enemy.behavior;
    const bulletSpeed = enemy.boss.getBulletSpeed(time);
    const damageScale = this.getDamageScale();
    let bulletType: BulletType = 'asteroid';
    let useDelayedShot = Phaser.Math.FloatBetween(0, 1) < behavior.delayedShotChance;

    if (behavior.pattern === 'mixed') {
      const weights = behavior.bulletWeights ?? { asteroid: 0.4, meteora: 0.3, viper: 0.2, hound: 0.1, red: 0 };
      const roll = Phaser.Math.FloatBetween(0, 1);
      if (roll < weights.asteroid) {
        bulletType = 'asteroid';
      } else if (roll < weights.asteroid + weights.meteora) {
        bulletType = 'meteora';
      } else if (roll < weights.asteroid + weights.meteora + weights.viper) {
        bulletType = 'viper';
      } else if (roll < weights.asteroid + weights.meteora + weights.viper + weights.hound) {
        bulletType = 'hound';
      } else {
        bulletType = 'red';
      }
    } else if (behavior.pattern === 'meteoraBarrage') {
      const houndIntervalMs = behavior.houndIntervalMs ?? 0;
      if (houndIntervalMs > 0 && time - (enemy.lastHoundTime ?? 0) >= houndIntervalMs) {
        bulletType = 'hound';
        enemy.lastHoundTime = time;
        useDelayedShot = false;
      } else {
        bulletType = 'meteora';
      }
    } else {
      const redChance = behavior.redShotChance ?? 0;
      if (redChance > 0 && Phaser.Math.FloatBetween(0, 1) < redChance) {
        bulletType = 'red';
        useDelayedShot = false;
      } else {
        bulletType = 'asteroid';
      }
    }

    if (bulletType === 'red') {
      useDelayedShot = false;
    }

    if (bulletType === 'asteroid') {
      const asteroidDamage = useDelayedShot
        ? GAME_CONFIG.ASTEROID_DELAY_TRION_DAMAGE
        : GAME_CONFIG.ASTEROID_TRION_DAMAGE;
      const bullet = new Bullet(
        this,
        fireData.x,
        fireData.y,
        fireData.angle,
        'asteroid',
        false,
        asteroidDamage * damageScale,
        GAME_CONFIG.ASTEROID_SHIELD_DAMAGE * damageScale,
        bulletSpeed * GAME_CONFIG.ASTEROID_SPEED_MULTIPLIER
      );
      this.bossBullets.push(bullet);
      this.trimBulletPool(this.bossBullets, this.maxBossBullets);
      if (useDelayedShot) {
        this.scheduleDelayedRelease(bullet, () => ({ x: this.player.x, y: this.player.y }), 3000);
      }
      return;
    }

    if (bulletType === 'meteora') {
      const bullet = new Bullet(
        this,
        fireData.x,
        fireData.y,
        fireData.angle,
        'meteora',
        false,
        GAME_CONFIG.METEORA_TRION_DAMAGE * damageScale,
        GAME_CONFIG.METEORA_SHIELD_DAMAGE * damageScale,
        bulletSpeed
      );
      this.bossBullets.push(bullet);
      this.trimBulletPool(this.bossBullets, this.maxBossBullets);
      if (useDelayedShot) {
        this.scheduleDelayedRelease(bullet, () => ({ x: this.player.x, y: this.player.y }), 3000);
      }
      return;
    }

    if (bulletType === 'red') {
      const bullet = new Bullet(
        this,
        fireData.x,
        fireData.y,
        fireData.angle,
        'red',
        false,
        GAME_CONFIG.RED_BULLET_TRION_DAMAGE * damageScale,
        GAME_CONFIG.RED_BULLET_SHIELD_DAMAGE * damageScale,
        enemy.boss.getBulletSpeed(time, GAME_CONFIG.RED_BULLET_SPEED)
      );
      this.bossBullets.push(bullet);
      this.trimBulletPool(this.bossBullets, this.maxBossBullets);
      return;
    }

    const bullet = new Bullet(
      this,
      fireData.x,
      fireData.y,
      fireData.angle,
      bulletType,
      false,
      bulletType === 'hound'
        ? GAME_CONFIG.HOUND_TRION_DAMAGE * damageScale
        : GAME_CONFIG.VIPER_TRION_DAMAGE * damageScale,
      bulletType === 'hound'
        ? GAME_CONFIG.HOUND_SHIELD_DAMAGE * damageScale
        : GAME_CONFIG.VIPER_SHIELD_DAMAGE * damageScale,
      enemy.boss.getBulletSpeed(
        time,
        bulletType === 'hound' ? GAME_CONFIG.HOUND_SPEED : GAME_CONFIG.VIPER_SPEED
      )
    );
    this.bossBullets.push(bullet);
    this.trimBulletPool(this.bossBullets, this.maxBossBullets);
    if (useDelayedShot) {
      this.scheduleDelayedRelease(bullet, () => ({ x: this.player.x, y: this.player.y }), 3000);
    }
  }

  private updateBullets(delta: number) {
    const targetPosition = this.isMobileMode ? this.getClosestEnemyPosition() : null;
    const mouseX = targetPosition?.x ?? this.input.activePointer.worldX;
    const mouseY = targetPosition?.y ?? this.input.activePointer.worldY;
    
    // Update and clean up player bullets
    this.playerBullets = this.playerBullets.filter(bullet => {
      bullet.update(delta, mouseX, mouseY);
      return bullet.active;
    });
    
    // Update and clean up boss bullets
    this.bossBullets = this.bossBullets.filter(bullet => {
      bullet.update(delta, this.player.x, this.player.y);
      return bullet.active;
    });
  }

  private cleanupDefeatedEnemies() {
    if (this.gameState.bossTrion <= 0 && this.boss.sprite.active) {
      this.boss.destroy();
    }

    this.extraEnemies = this.extraEnemies.filter(enemy => {
      if (enemy.trion <= 0) {
        enemy.boss.destroy();
        return false;
      }
      return true;
    });
  }

  private handleHeldBulletImpact(bulletA: Bullet, bulletB: Bullet): boolean {
    const hasHeld = bulletA.isHeld || bulletB.isHeld;
    if (!hasHeld) return false;

    bulletA.destroy();
    bulletB.destroy();
    return true;
  }

  private resolveBulletInterceptions() {
    for (const playerBullet of this.playerBullets) {
      if (!playerBullet.active) continue;
      if (playerBullet.type === 'red') continue;
      const playerBounds = playerBullet.getBounds();

      for (const bossBullet of this.bossBullets) {
        if (!bossBullet.active) continue;
        const bossBounds = bossBullet.getBounds();

        if (Phaser.Geom.Intersects.CircleToCircle(playerBounds, bossBounds)) {
          if (this.handleHeldBulletImpact(playerBullet, bossBullet)) {
            this.createBulletClashEffect(playerBullet.x, playerBullet.y);
            this.playBulletClashSound();
            break;
          }
          if (playerBullet.type === 'meteora') {
            this.triggerMeteoraExplosion(playerBullet);
          } else {
            playerBullet.destroy();
          }
          bossBullet.destroy();
          this.createBulletClashEffect(playerBullet.x, playerBullet.y);
          this.playBulletClashSound();
          break;
        }
      }
    }
  }

  private resolveHeldBulletClashes(bullets: Bullet[]) {
    const heldBullets = bullets.filter(bullet => bullet.active && bullet.isHeld);
    if (heldBullets.length === 0) return;

    for (const bullet of bullets) {
      if (!bullet.active || bullet.isHeld) continue;
      const bulletBounds = bullet.getBounds();

      for (const heldBullet of heldBullets) {
        if (!heldBullet.active || heldBullet === bullet) continue;
        const heldBounds = heldBullet.getBounds();

        if (Phaser.Geom.Intersects.CircleToCircle(bulletBounds, heldBounds)) {
          if (!this.handleHeldBulletImpact(bullet, heldBullet)) {
            if (bullet.type === 'meteora') {
              this.triggerMeteoraExplosion(bullet);
            } else {
              bullet.destroy();
            }
            heldBullet.destroy();
          }
          this.createBulletClashEffect(bullet.x, bullet.y);
          this.playBulletClashSound();
          break;
        }
      }
    }
  }

  private createBulletClashEffect(x: number, y: number) {
    const core = this.add.circle(x, y, 8, 0xffffff, 0.9);
    core.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    const ring = this.add.circle(x, y, 14, GAME_CONFIG.BOSS_BULLET_COLOR, 0.4);

    this.tweens.add({
      targets: [core, ring],
      alpha: 0,
      scale: 2.2,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        core.destroy();
        ring.destroy();
      },
    });
  }

  private playBulletClashSound() {
    const soundManager = this.sound as Phaser.Sound.WebAudioSoundManager;
    if (!soundManager || !('context' in soundManager)) return;
    const context = soundManager.context;
    if (!context) return;
    if (context.state === 'suspended') {
      context.resume().catch(() => undefined);
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(720, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(260, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
  }

  private circleHitsShield(area: Phaser.Geom.Circle, shield: Shield): boolean {
    const shieldBounds = shield.getBounds();

    if (shieldBounds instanceof Phaser.Geom.Rectangle) {
      return Phaser.Geom.Intersects.CircleToRectangle(area, shieldBounds);
    }

    return Phaser.Geom.Intersects.CircleToCircle(area, shieldBounds);
  }

  private bulletHitsShield(bullet: Bullet, shield: Shield): boolean {
    if (bullet.ignoreShield) return false;
    const bulletBounds = bullet.getBounds();
    const shieldBounds = shield.getBounds();

    if (shieldBounds instanceof Phaser.Geom.Rectangle) {
      return Phaser.Geom.Intersects.CircleToRectangle(bulletBounds, shieldBounds);
    }

    return Phaser.Geom.Intersects.CircleToCircle(bulletBounds, shieldBounds);
  }

  private applyMeteoraExplosion(initialArea: Phaser.Geom.Circle) {
    const shouldRegisterHits = false;
    this.applyMeteoraExplosionWithTracking(initialArea, shouldRegisterHits);
  }

  private applyMeteoraExplosionWithTracking(initialArea: Phaser.Geom.Circle, registerHits: boolean) {
    const pendingExplosions: Phaser.Geom.Circle[] = [initialArea];
    const damageScale = this.getDamageScale();

    while (pendingExplosions.length > 0) {
      const area = pendingExplosions.shift();
      if (!area) continue;

      const bullets = [...this.playerBullets, ...this.bossBullets];
      for (const bullet of bullets) {
        if (!bullet.active) continue;
        const bulletBounds = bullet.getBounds();
        if (!Phaser.Geom.Intersects.CircleToCircle(area, bulletBounds)) continue;

        if (bullet.type === 'meteora') {
          const chainedArea = bullet.explode();
          if (chainedArea) {
            pendingExplosions.push(chainedArea);
          }
        } else {
          bullet.destroy();
        }
      }

      for (const target of this.getEnemyTargets()) {
        const boss = target.boss;
        if (boss.shieldActive && boss.shield && this.circleHitsShield(area, boss.shield)) {
          boss.applyShieldDamage(GAME_CONFIG.METEORA_SHIELD_DAMAGE * damageScale);
          continue;
        }

        const bossBounds = new Phaser.Geom.Circle(boss.x, boss.y, boss.getRadius());
        if (Phaser.Geom.Intersects.CircleToCircle(area, bossBounds)) {
          const damage = GAME_CONFIG.METEORA_TRION_DAMAGE * damageScale;
          target.setTrion(target.getTrion() - damage);
          this.showDamageNumber(boss.x, boss.y, damage, false);
          if (registerHits) {
            this.registerTutorialBulletHit('meteora');
          }
        }
      }
    }
  }

  private getDamageScale() {
    return DIFFICULTY_DAMAGE_MULTIPLIER[this.difficulty];
  }

  private showDamageNumber(x: number, y: number, damage: number, isPlayerDamage: boolean) {
    const color = isPlayerDamage ? '#ff6b6b' : '#00ffd5';
    const offsetX = Phaser.Math.Between(-20, 20);
    const offsetY = Phaser.Math.Between(-10, 10);
    
    const damageText = this.add.text(x + offsetX, y + offsetY, `-${Math.round(damage)}`, {
      fontSize: isPlayerDamage ? '24px' : '20px',
      fontFamily: 'monospace',
      color: color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    damageText.setOrigin(0.5, 0.5);
    damageText.setDepth(90);
    this.damageTexts.push(damageText);
    
    this.tweens.add({
      targets: damageText,
      y: damageText.y - 50,
      alpha: 0,
      scale: isPlayerDamage ? 1.3 : 1.1,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        const index = this.damageTexts.indexOf(damageText);
        if (index > -1) {
          this.damageTexts.splice(index, 1);
        }
        damageText.destroy();
      }
    });
  }

  private triggerMeteoraExplosion(bullet: Bullet) {
    const explosionArea = bullet.explode();
    if (explosionArea) {
      this.applyMeteoraExplosionWithTracking(explosionArea, bullet.isPlayerBullet);
    }
  }

  private checkCollisions() {
    const playerRadius = GAME_CONFIG.PLAYER_RADIUS;

    this.resolveBulletInterceptions();
    this.resolveHeldBulletClashes(this.playerBullets);
    this.resolveHeldBulletClashes(this.bossBullets);
    
    // Player bullets vs Boss
    for (const bullet of this.playerBullets) {
      if (!bullet.active) continue;

      for (const target of this.getEnemyTargets()) {
        // Check boss shield first
        if (target.boss.shieldActive && target.boss.shield) {
          if (this.bulletHitsShield(bullet, target.boss.shield)) {
            if (bullet.isPlayerBullet) {
              this.registerTutorialBulletHit(bullet.type, true, bullet.viperModeIndex);
            }
            if (bullet.type === 'meteora') {
              this.triggerMeteoraExplosion(bullet);
            } else {
              bullet.destroy();
              target.boss.applyShieldDamage(bullet.shieldDamage);
            }
            break;
          }
        }

        // Check bullet vs boss
        const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, target.boss.x, target.boss.y);
        const bossRadius = target.boss.getRadius();

        const bulletRadius = bullet.getBounds().radius;
        if (bullet.type === 'meteora') {
          // Meteora explodes on contact
          if (dist < bossRadius + bulletRadius) {
            this.triggerMeteoraExplosion(bullet);
            break;
          }
        } else {
          // Asteroid direct hit
          if (dist < bossRadius + bulletRadius) {
            target.setTrion(target.getTrion() - bullet.trionDamage);
            this.showDamageNumber(target.boss.x, target.boss.y, bullet.trionDamage, false);
            if (bullet.type === 'red') {
              target.boss.applySlow(
                GAME_CONFIG.RED_BULLET_SLOW_DURATION,
                GAME_CONFIG.RED_BULLET_SLOW_MULTIPLIER
              );
            }
            if (bullet.isPlayerBullet) {
              this.registerTutorialBulletHit(bullet.type, false, bullet.viperModeIndex);
            }
            bullet.destroy();
            break;
          }
        }
      }
    }
    
    // Meteora explosions handled by triggerMeteoraExplosion/applyMeteoraExplosion
    
    // Boss bullets vs Player
    for (const bullet of this.bossBullets) {
      if (!bullet.active) continue;
      
      // Check player shield
      if (this.playerShield?.active && this.playerShield) {
        if (this.bulletHitsShield(bullet, this.playerShield)) {
          const shieldType = this.playerShield.type;
          const wasActive = this.playerShield.active;
          if (bullet.type === 'meteora') {
            this.triggerMeteoraExplosion(bullet);
          } else {
            bullet.destroy();
          }
          this.playerShield.applyDamage(bullet.shieldDamage);
          if (wasActive && !this.playerShield.active) {
            this.registerTutorialShieldBreak(shieldType);
          }
          continue;
        }
      }
      
      // Check bullet vs player
      const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, this.player.x, this.player.y);
      const bulletRadius = bullet.getBounds().radius;
      if (dist < playerRadius + bulletRadius) {
        this.gameState.playerTrion -= bullet.trionDamage;
        this.showDamageNumber(this.player.x, this.player.y, bullet.trionDamage, true);
        if (bullet.type === 'red') {
          this.player.applySlow(
            GAME_CONFIG.RED_BULLET_SLOW_DURATION,
            GAME_CONFIG.RED_BULLET_SLOW_MULTIPLIER
          );
        }
        bullet.destroy();
      }
    }
  }

  private regenerateTrion(delta: number) {
    const regenAmount = GAME_CONFIG.TRION_REGEN_RATE * (delta / 1000);
    
    this.gameState.playerTrion = Math.min(
      GAME_CONFIG.PLAYER_TRION_MAX,
      this.gameState.playerTrion + regenAmount
    );
    
    if (this.gameState.bossTrion > 0 || this.isTutorialMode) {
      this.gameState.bossTrion = Math.min(
        this.getBossMaxTrion(),
        this.gameState.bossTrion + regenAmount
      );
    }

    for (const enemy of this.extraEnemies) {
      if (enemy.trion <= 0) continue;
      enemy.trion = Math.min(enemy.maxTrion, enemy.trion + regenAmount);
    }
  }

  private updateUI() {
    const barWidth = 250;
    const barHeight = 24;
    const uiY = 42;
    
    // Player Trion Bar
    if (this.isRenderableObject(this.playerTrionBar)) {
      this.playerTrionBar.clear();
      this.playerTrionBar.fillStyle(0x1a1a2e, 1);
      this.playerTrionBar.fillRect(20, uiY, barWidth, barHeight);
    }
    
    const playerRatio = Math.max(0, this.gameState.playerTrion / GAME_CONFIG.PLAYER_TRION_MAX);
    if (this.isRenderableObject(this.playerTrionBar)) {
      this.playerTrionBar.fillStyle(GAME_CONFIG.BULLET_COLOR, 1);
      this.playerTrionBar.fillRect(20, uiY, barWidth * playerRatio, barHeight);
      
      this.playerTrionBar.lineStyle(2, 0x00ffd5, 0.5);
      this.playerTrionBar.strokeRect(20, uiY, barWidth, barHeight);
    }
    
    this.safeSetText(this.playerTrionText, `${Math.floor(this.gameState.playerTrion)}`);
    
    // Boss Trion Bar
    if (this.isRenderableObject(this.bossTrionBar)) {
      this.bossTrionBar.clear();
      this.bossTrionBar.fillStyle(0x1a1a2e, 1);
      this.bossTrionBar.fillRect(GAME_CONFIG.WIDTH - 20 - barWidth, uiY, barWidth, barHeight);
    }
    
    let primaryTrion = this.gameState.bossTrion;
    let primaryMaxTrion = this.getBossMaxTrion();
    let primaryColor = GAME_CONFIG.BOSS_COLOR;
    let primaryExtraIndex = -1;
    if (this.gameState.bossTrion <= 0 && !this.isTutorialMode && this.extraEnemies.length > 0) {
      primaryExtraIndex = 0;
      const primaryExtra = this.extraEnemies[primaryExtraIndex];
      primaryTrion = primaryExtra.trion;
      primaryMaxTrion = primaryExtra.maxTrion;
      primaryColor = primaryExtraIndex === 0 ? 0xffa94d : 0xff6bf0;
    }

    const bossRatio = Math.max(0, primaryTrion / primaryMaxTrion);
    if (this.isRenderableObject(this.bossTrionBar)) {
      this.bossTrionBar.fillStyle(primaryColor, 1);
      this.bossTrionBar.fillRect(GAME_CONFIG.WIDTH - 20 - barWidth, uiY, barWidth * bossRatio, barHeight);
      
      this.bossTrionBar.lineStyle(2, primaryColor, 0.6);
      this.bossTrionBar.strokeRect(GAME_CONFIG.WIDTH - 20 - barWidth, uiY, barWidth, barHeight);
    }
    
    this.safeSetText(this.bossTrionText, `${Math.floor(primaryTrion)}`);
    
    // Bullet type display
    if (this.gameState.currentBulletType !== this.lastBulletType) {
      this.lastBulletType = this.gameState.currentBulletType;
      this.events.emit('bullet-type-changed', this.gameState.currentBulletType);
    }
    const bulletName = this.getBulletDisplayName(this.gameState.currentBulletType);
    this.safeSetText(this.bulletTypeText, `トリガー: ${bulletName}`);

    if (this.gameState.currentBulletType === 'viper') {
      this.safeSetText(this.delayedAsteroidText, `弾道: ${this.viperModeIndex + 1}`);
      if (this.isRenderableObject(this.delayedAsteroidText)) {
        this.delayedAsteroidText.setColor('#00e5ff');
      }
    } else {
      const delayStatus = this.gameState.delayedAsteroidEnabled ? 'オン' : 'オフ';
      this.safeSetText(this.delayedAsteroidText, `遅延: ${delayStatus}`);
      if (this.isRenderableObject(this.delayedAsteroidText)) {
        this.delayedAsteroidText.setColor(this.gameState.delayedAsteroidEnabled ? '#00ffd5' : '#666666');
      }
    }
    
    const enemyBarWidth = 160;
    const enemyBarHeight = 12;
    const enemyStartY = uiY + 44;
    const enemySpacing = 26;

    const secondaryEnemies = primaryExtraIndex === -1 ? this.extraEnemies : this.extraEnemies.slice(1);
    const activeEnemies = secondaryEnemies.filter(enemy => enemy.trion > 0);
    const labelOffset = primaryExtraIndex === -1 ? 1 : primaryExtraIndex + 2;
    this.enemyBars.forEach((bar, index) => {
      const enemy = activeEnemies[index];
      const label = this.enemyLabels[index];
      const text = this.enemyTexts[index];
      if (!this.isRenderableObject(bar) || !this.isRenderableObject(label) || !this.isRenderableObject(text)) {
        return;
      }
      if (!enemy) {
        bar.clear();
        bar.setVisible(false);
        label.setVisible(false);
        text.setVisible(false);
        return;
      }

      const barX = GAME_CONFIG.WIDTH - 20 - enemyBarWidth;
      const barY = enemyStartY + index * enemySpacing;
      const ratio = Math.max(0, enemy.trion / enemy.maxTrion);
      const enemyIndex = this.extraEnemies.indexOf(enemy);
      const barColor = enemyIndex === 0 ? 0xffa94d : 0xff6bf0;
      bar.clear();
      bar.fillStyle(0x1a1a2e, 1);
      bar.fillRect(barX, barY, enemyBarWidth, enemyBarHeight);
      bar.fillStyle(barColor, 1);
      bar.fillRect(barX, barY, enemyBarWidth * ratio, enemyBarHeight);
      bar.lineStyle(1, 0xffffff, 0.4);
      bar.strokeRect(barX, barY, enemyBarWidth, enemyBarHeight);
      bar.setVisible(true);

      label.setPosition(barX, barY - 10);
      label.setText(`敵 ${index + labelOffset}`);
      label.setVisible(true);

      text.setText(`${Math.floor(enemy.trion)}`);
      text.setPosition(barX - 40, barY + 2);
      text.setVisible(true);
    });

    if (this.isTutorialMode) {
      this.updateTutorialFocusHighlight();
    }
  }

  private isRenderableObject<T extends Phaser.GameObjects.GameObject>(object?: T | null): object is T {
    return Boolean(object && object.active && object.scene);
  }

  private safeSetText(text: Phaser.GameObjects.Text | undefined, value: string) {
    if (this.isRenderableObject(text)) {
      text.setText(value);
    }
  }

  private checkGameOver() {
    if (this.gameState.playerTrion <= 0) {
      this.gameState.isGameOver = true;
      this.gameState.playerWon = false;
      this.showGameOver('トリオン枯渇\n\n敗北');
    } else if (this.gameState.bossTrion <= 0 && this.extraEnemies.length === 0) {
      this.gameState.isGameOver = true;
      this.gameState.playerWon = true;
      this.showGameOver('ボス撃破\n\n勝利！');
    }
  }

  private showGameOver(message: string) {
    const restartMessage = this.isMobileMode ? 'リスタートボタンをタップ' : 'Rでリスタート';
    const shouldShowAdvice = !this.gameState.playerWon && !this.isTutorialMode && this.gameState.bossTrion > 0;
    this.gameOverText.setText(`${message}\n\n${restartMessage}`);
    const gameOverTextY = shouldShowAdvice
      ? GAME_CONFIG.HEIGHT / 2 - (this.isMobileMode ? 130 : 95)
      : GAME_CONFIG.HEIGHT / 2;
    this.gameOverText.setPosition(GAME_CONFIG.WIDTH / 2, gameOverTextY);
    this.gameOverText.setVisible(true);
    this.gameOverText.setColor(this.gameState.playerWon ? '#00ffd5' : '#ff6b6b');
    
    // Add background
    const backgroundHeight = this.isMobileMode ? (shouldShowAdvice ? 520 : 360) : (shouldShowAdvice ? 420 : 300);
    const backgroundWidth = this.isMobileMode ? 460 : 420;
    const bg = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT / 2,
      backgroundWidth,
      backgroundHeight,
      0x0a0a12,
      0.9
    );
    bg.setStrokeStyle(2, this.gameState.playerWon ? GAME_CONFIG.BULLET_COLOR : GAME_CONFIG.BOSS_COLOR);
    bg.setDepth(99);
    this.gameOverText.setDepth(100);

    const buttonWidth = this.isMobileMode ? 260 : 200;
    const buttonHeight = this.isMobileMode ? 90 : 55;
    const buttonY = GAME_CONFIG.HEIGHT / 2 + (this.isMobileMode ? (shouldShowAdvice ? 220 : 140) : (shouldShowAdvice ? 170 : 120));

    const restartButton = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      buttonY,
      buttonWidth,
      buttonHeight,
      0x1a1a3a,
      0.95
    );
    restartButton.setStrokeStyle(3, this.gameState.playerWon ? GAME_CONFIG.BULLET_COLOR : GAME_CONFIG.BOSS_COLOR, 0.9);
    restartButton.setDepth(101);

    const restartText = this.add.text(GAME_CONFIG.WIDTH / 2, buttonY, 'リスタート', {
      fontSize: this.isMobileMode ? '36px' : '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    restartText.setOrigin(0.5);
    restartText.setDepth(102);

    if (shouldShowAdvice) {
      const adviceMessage = this.isMobileMode
        ? '攻略ヒント:\nバイパーは弾道を事前に引けるので、\nシールドの裏を狙う弾道を作ろう。\nバイパーが多い時は全方位シールド(Shift+Space)\n→ 弾道を読まれない位置取りが有効。'
        : '攻略ヒント:\nバイパーは弾道を事前に引けるので、\nシールドの裏を狙う弾道を作ろう。\nバイパーが多い時は全方位シールド(Shift+Space)を装備し、\n弾道を読まれない位置取りを意識すると有利。';
      const adviceText = this.add.text(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 + (this.isMobileMode ? 10 : 20), adviceMessage, {
        fontSize: this.isMobileMode ? '16px' : '18px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: this.isMobileMode ? 6 : 8,
      });
      adviceText.setOrigin(0.5);
      adviceText.setDepth(100);
    }

    const handleRestart = () => {
      this.scene.restart();
    };

    restartButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleRestart);
    restartText.setInteractive({ useHandCursor: true }).on('pointerdown', handleRestart);
  }

  // Mobile control methods - called from React component
  public setMobileMove(x: number, y: number) {
    this.mobileInput.moveX = x;
    this.mobileInput.moveY = y;
    if (x !== 0 || y !== 0) {
      this.registerTutorialTap();
    }
    // Update aim direction based on movement for mobile
    if (x !== 0 || y !== 0) {
      this.mobileInput.aimX = this.player.x + x * 200;
      this.mobileInput.aimY = this.player.y + y * 200;
    }
  }

  public setMobileAttack(attacking: boolean) {
    this.mobileInput.attacking = attacking;
    if (attacking) {
      this.registerTutorialTap();
    }
  }

  public triggerCycleBullet() {
    if (this.gameState.isGameOver || !this.gameStarted) return;
    this.registerTutorialTap();
    const types = this.availableBulletTypes;
    const currentIndex = types.indexOf(this.gameState.currentBulletType);
    if (types.length > 0) {
      this.gameState.currentBulletType = types[(currentIndex + 1) % types.length];
      this.registerTutorialSwitch();
    }
  }

  public triggerDelayToggle() {
    if (this.gameState.isGameOver || !this.gameStarted) return;
    this.registerTutorialTap();
    if (this.gameState.currentBulletType === 'viper') {
      this.cycleViperMode();
    } else if (this.gameState.currentBulletType === 'asteroid') {
      this.toggleDelayedAsteroidMode();
    }
  }

  public triggerShield(wide: boolean = false) {
    if (this.gameState.isGameOver || !this.gameStarted) return;
    this.registerTutorialTap();
    if (wide) {
      // Temporarily set shift key state for wide shield
      const originalShift = this.shiftKey?.isDown;
      if (this.shiftKey) {
        (this.shiftKey as any).isDown = true;
      }
      this.tryDeployShield();
      if (this.shiftKey) {
        (this.shiftKey as any).isDown = originalShift || false;
      }
    } else {
      this.tryDeployShield();
    }
  }

  public getMobileInput() {
    return this.mobileInput;
  }

  public isMobileAttacking() {
    return this.mobileInput.attacking;
  }

  public startGameWithDifficulty(difficulty: Difficulty) {
    this.difficulty = difficulty;
    this.startBattle();
  }
}
