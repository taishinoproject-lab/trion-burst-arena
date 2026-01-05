import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { GAME_CONFIG } from './constants';

export const createGameConfig = (
  parent: string,
  isMobile: boolean = false,
  scenes: Phaser.Types.Scenes.SceneType[] = [MainScene]
): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  width: GAME_CONFIG.WIDTH,
  height: GAME_CONFIG.HEIGHT,
  parent,
  backgroundColor: GAME_CONFIG.BACKGROUND_COLOR,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: scenes,
  input: {
    mouse: {
      target: undefined,
    },
    touch: {
      capture: true,
    },
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
  scale: {
    mode: isMobile ? Phaser.Scale.ENVELOP : Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_CONFIG.WIDTH,
    height: GAME_CONFIG.HEIGHT,
  },
});
