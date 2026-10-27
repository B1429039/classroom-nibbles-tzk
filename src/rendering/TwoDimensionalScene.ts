import { APP_CONFIG } from "../core/Config";
import { Arena, BoundaryMode } from "../gameplay/Arena";
import type { EnvironmentObstacle, EnvironmentProfile } from "../gameplay/Environment";
import type { PowerUpEntity } from "../gameplay/PowerUpPool";
import { powerUpDisplayLabel } from "../gameplay/PowerUpPool";
import { directionVector } from "../gameplay/Direction";
import { Snake } from "../gameplay/Snake";
import {
  TableMotionMode,
  type TableMotionStatus,
} from "../gameplay/TableMotionSystem";
import type { TokenEntity } from "../gameplay/TokenPool";
import { tokenDisplayLabel } from "../gameplay/TokenPool";
import type { BulletEntity } from "../gameplay/WeaponSystem";
import type { CharacterToken } from "../vocabulary/types";
import { MechaBackflipAnimator } from "./MechaBackflipAnimator";
import { detectDevicePixelRatio } from "./DeviceResolution";

export type AnimationFrameHandler = () => void;

interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

interface PlayfieldMetrics {
  readonly centerX: number;
  readonly centerY: number;
  readonly scale: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
}

function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function rgba(color: string, alpha: number): string {
  const normalized = color.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgb(${red} ${green} ${blue} / ${alpha})`;
}

function damp(current: number, target: number, speed: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-speed * delta));
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const corner = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

/**
 * Top-down 2D presentation for the existing XZ gameplay model.
 *
 * The gameplay still owns all positions and rules. This class only maps those
 * positions to a responsive canvas, so changing the presentation cannot change
 * collision, spawning, vocabulary order or input behavior.
 */
export class TwoDimensionalScene {
  readonly #container: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  #environment: EnvironmentProfile;
  #activePixelRatio = 0;
  #animationFrameId: number | null = null;
  #animationLoop: AnimationFrameHandler | null = null;
  #width = 1;
  #height = 1;
  #tableRotation = 0;
  #tableOffsetX = 0;
  #tableOffsetY = 0;
  readonly #backflip = new MechaBackflipAnimator(
    APP_CONFIG.scene.mechaBackflipDurationSeconds,
  );

  constructor(
    container: HTMLElement,
    arena: Arena,
    environment: EnvironmentProfile,
  ) {
    this.#container = container;
    this.#environment = environment;
    this.#canvas = document.createElement("canvas");
    const context = this.#canvas.getContext("2d");
    if (!context) throw new Error("無法建立 2D 遊戲畫布。");
    this.#context = context;
    this.#canvas.className = "phase-two-dimensional-scene";
    this.#canvas.dataset.testid = "phase-three-canvas";
    this.#canvas.dataset.renderMode = "canvas-2d";
    this.#canvas.dataset.graphicsApi = "canvas-2d";
    this.#canvas.dataset.cameraMode = "top-down-2d";
    this.#canvas.dataset.cameraCount = "0";
    this.#canvas.dataset.backflipState = "idle";
    this.#canvas.dataset.backflipScope = "mecha";
    this.#canvas.dataset.mechaBodyPattern = "flat-segmented-mecha";
    this.#canvas.dataset.mechaSegmentSeparator = "energy-rings";
    this.#canvas.dataset.nextTokenCue = "pulsing-yellow-ring";
    this.#canvas.dataset.resolutionMode = "device-native";
    this.#canvas.setAttribute(
      "aria-label",
      "NIBBLES 2D 俯視字彙遊戲場，顯示蛇、字母、道具、障礙物與邊界",
    );
    container.prepend(this.#canvas);
    window.addEventListener("resize", this.#resize);
    this.#resize();
    this.#setArenaData(arena);
    this.setEnvironment(environment);
  }

  setEnvironment(environment: EnvironmentProfile): void {
    this.#environment = environment;
    this.#canvas.dataset.environmentKind = environment.kind
      .toLowerCase()
      .replaceAll("_", "-");
    this.#canvas.dataset.environmentName = environment.sceneName;
    this.#canvas.dataset.spaceTheme = environment.spaceBackdrop.id;
    this.#canvas.dataset.obstacleCount = String(environment.obstacles.length);
    this.#canvas.setAttribute(
      "aria-label",
      `NIBBLES 2D 俯視字彙遊戲場：${environment.sceneName}，${environment.featureLabel}`,
    );
  }

  setAnimationLoop(handler: AnimationFrameHandler | null): void {
    this.#animationLoop = handler;
    if (handler && this.#animationFrameId === null) {
      this.#scheduleAnimationFrame();
    } else if (!handler && this.#animationFrameId !== null) {
      cancelAnimationFrame(this.#animationFrameId);
      this.#animationFrameId = null;
    }
  }

  triggerBackflip(): boolean {
    return this.#backflip.trigger();
  }

  get backflipActive(): boolean {
    return this.#backflip.active;
  }

  get backflipProgress(): number {
    return this.#backflip.progress;
  }

  render(
    snake: Snake,
    arena: Arena,
    tokens: readonly TokenEntity[],
    powerUps: readonly PowerUpEntity[],
    bullets: readonly BulletEntity[],
    nextToken: CharacterToken | null,
    tableMotion: TableMotionStatus | null,
    elapsedSeconds: number,
    frameDeltaSeconds: number,
  ): void {
    if (detectDevicePixelRatio() !== this.#activePixelRatio) this.#resize();
    this.#backflip.update(frameDeltaSeconds);
    this.#updateTableMotion(tableMotion, elapsedSeconds, frameDeltaSeconds);
    this.#setCanvasData("tokenCount", String(tokens.length));
    this.#setCanvasData("powerUpCount", String(powerUps.length));
    this.#setCanvasData("bulletCount", String(bullets.length));
    this.#setCanvasData("tokenPositionChecksum", this.#positionChecksum(tokens));
    this.#setCanvasData("powerUpPositionChecksum", this.#positionChecksum(powerUps));
    this.#setCanvasData("backflipState", this.#backflip.active ? "active" : "idle");
    this.#setCanvasData("backflipProgress", this.#backflip.progress.toFixed(3));
    this.#setCanvasData("drawCallCount", "1");

    const metrics = this.#playfieldMetrics(arena);
    const context = this.#context;
    context.setTransform(this.#activePixelRatio, 0, 0, this.#activePixelRatio, 0, 0);
    context.clearRect(0, 0, this.#width, this.#height);
    context.save();
    context.translate(
      metrics.centerX + this.#tableOffsetX,
      metrics.centerY + this.#tableOffsetY,
    );
    context.rotate(this.#tableRotation);
    this.#drawPlayfield(context, arena, metrics);
    this.#drawObstacles(context, metrics);
    this.#drawTokens(context, arena, metrics, tokens, nextToken, elapsedSeconds);
    this.#drawPowerUps(context, arena, metrics, powerUps, elapsedSeconds);
    this.#drawBullets(context, arena, metrics, bullets);
    this.#drawSnake(context, arena, metrics, snake);
    context.restore();
  }

  dispose(): void {
    window.removeEventListener("resize", this.#resize);
    this.setAnimationLoop(null);
    this.#canvas.remove();
  }

  readonly #resize = (): void => {
    const rectangle = this.#container.getBoundingClientRect();
    this.#width = Math.max(rectangle.width || this.#container.clientWidth, 1);
    this.#height = Math.max(rectangle.height || this.#container.clientHeight, 1);
    this.#activePixelRatio = detectDevicePixelRatio();
    this.#canvas.width = Math.max(1, Math.round(this.#width * this.#activePixelRatio));
    this.#canvas.height = Math.max(1, Math.round(this.#height * this.#activePixelRatio));
    this.#canvas.style.width = `${this.#width}px`;
    this.#canvas.style.height = `${this.#height}px`;
    this.#setCanvasData("renderPixelRatio", this.#activePixelRatio.toFixed(3));
    this.#setCanvasData("renderWidth", String(this.#canvas.width));
    this.#setCanvasData("renderHeight", String(this.#canvas.height));
  };

  #scheduleAnimationFrame(): void {
    this.#animationFrameId = requestAnimationFrame(() => {
      this.#animationFrameId = null;
      this.#animationLoop?.();
      if (this.#animationLoop) this.#scheduleAnimationFrame();
    });
  }

  #setArenaData(arena: Arena): void {
    this.#canvas.dataset.arenaWidth = String(arena.config.halfWidth * 2);
    this.#canvas.dataset.arenaDepth = String(arena.config.halfDepth * 2);
    this.#canvas.dataset.xBoundary = arena.config.xBoundaryMode;
    this.#canvas.dataset.zBoundary = arena.config.zBoundaryMode;
  }

  #setCanvasData(key: string, value: string): void {
    if (this.#canvas.dataset[key] !== value) this.#canvas.dataset[key] = value;
  }

  #playfieldMetrics(arena: Arena): PlayfieldMetrics {
    const { halfWidth, halfDepth } = arena.config;
    const horizontalSpace = this.#width * 0.74;
    const verticalSpace = this.#height * 0.82;
    const scale = Math.max(
      1,
      Math.min(
        horizontalSpace / (halfWidth * 2),
        verticalSpace / (halfDepth * 2),
      ),
    );
    return {
      centerX: this.#width / 2,
      centerY: this.#height * 0.53,
      scale,
      halfWidth,
      halfDepth,
    };
  }

  #worldToCanvas(point: { readonly x: number; readonly z: number }, metrics: PlayfieldMetrics): CanvasPoint {
    return {
      x: point.x * metrics.scale,
      // Canvas Y grows downward; using +Z here makes NORTH (-Z) appear upward.
      y: point.z * metrics.scale,
    };
  }

  #drawPlayfield(
    context: CanvasRenderingContext2D,
    arena: Arena,
    metrics: PlayfieldMetrics,
  ): void {
    const { palette } = this.#environment;
    const width = metrics.halfWidth * 2 * metrics.scale;
    const height = metrics.halfDepth * 2 * metrics.scale;
    const left = -width / 2;
    const top = -height / 2;
    const floor = hexColor(palette.floorColor);
    context.shadowColor = "rgb(0 0 0 / 55%)";
    context.shadowBlur = 28;
    context.fillStyle = rgba(floor, 0.96);
    roundedRectangle(context, left, top, width, height, 18);
    context.fill();
    context.shadowBlur = 0;

    context.save();
    context.beginPath();
    roundedRectangle(context, left, top, width, height, 18);
    context.clip();
    context.strokeStyle = rgba(hexColor(palette.gridLineColor), 0.34);
    context.lineWidth = Math.max(0.7, metrics.scale * 0.018);
    for (let x = -metrics.halfWidth; x <= metrics.halfWidth; x += 1) {
      const canvasX = x * metrics.scale;
      context.beginPath();
      context.moveTo(canvasX, top);
      context.lineTo(canvasX, -top);
      context.stroke();
    }
    for (let z = -metrics.halfDepth; z <= metrics.halfDepth; z += 1) {
      const canvasY = z * metrics.scale;
      context.beginPath();
      context.moveTo(left, canvasY);
      context.lineTo(-left, canvasY);
      context.stroke();
    }
    context.restore();

    this.#drawBoundary(context, arena, metrics, true);
    this.#drawBoundary(context, arena, metrics, false);
  }

  #drawBoundary(
    context: CanvasRenderingContext2D,
    arena: Arena,
    metrics: PlayfieldMetrics,
    vertical: boolean,
  ): void {
    const mode = vertical ? arena.config.xBoundaryMode : arena.config.zBoundaryMode;
    const { palette } = this.#environment;
    const color = mode === BoundaryMode.SOLID
      ? palette.solidWallColor
      : palette.wrapGateColor;
    const extent = vertical ? metrics.halfDepth : metrics.halfWidth;
    const offset = vertical ? metrics.halfWidth : metrics.halfDepth;
    context.save();
    context.strokeStyle = hexColor(color);
    context.lineWidth = Math.max(2, metrics.scale * 0.075);
    context.setLineDash(mode === BoundaryMode.WRAP ? [metrics.scale * 0.36, metrics.scale * 0.22] : []);
    for (const side of [-1, 1]) {
      context.beginPath();
      if (vertical) {
        context.moveTo(side * offset * metrics.scale, -extent * metrics.scale);
        context.lineTo(side * offset * metrics.scale, extent * metrics.scale);
      } else {
        context.moveTo(-extent * metrics.scale, side * offset * metrics.scale);
        context.lineTo(extent * metrics.scale, side * offset * metrics.scale);
      }
      context.stroke();
    }
    context.restore();
  }

  #drawObstacles(
    context: CanvasRenderingContext2D,
    metrics: PlayfieldMetrics,
  ): void {
    const { palette } = this.#environment;
    const body = hexColor(palette.obstacleColor);
    const accent = hexColor(palette.obstacleAccentColor);
    for (const obstacle of this.#environment.obstacles) {
      const point = this.#worldToCanvas(obstacle.position, metrics);
      const radius = obstacle.radius * metrics.scale;
      context.save();
      context.fillStyle = rgba(body, 0.8);
      context.strokeStyle = rgba(accent, 0.84);
      context.lineWidth = Math.max(1.5, metrics.scale * 0.05);
      this.#drawObstacleShape(context, obstacle, point, radius);
      context.fill();
      context.stroke();
      context.restore();
    }
  }

  #drawObstacleShape(
    context: CanvasRenderingContext2D,
    obstacle: EnvironmentObstacle,
    point: CanvasPoint,
    radius: number,
  ): void {
    if (obstacle.kind === "CARGO" || obstacle.kind === "PYLON") {
      roundedRectangle(context, point.x - radius, point.y - radius, radius * 2, radius * 2, radius * 0.22);
      return;
    }
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.closePath();
  }

  #drawTokens(
    context: CanvasRenderingContext2D,
    arena: Arena,
    metrics: PlayfieldMetrics,
    tokens: readonly TokenEntity[],
    nextToken: CharacterToken | null,
    elapsedSeconds: number,
  ): void {
    const target = tokens.find((entity) => entity.token === nextToken) ?? null;
    for (const token of tokens) {
      const point = this.#worldToCanvas(arena.toDisplayPoint(token.position), metrics);
      const radius = Math.max(11, token.radius * metrics.scale * 1.16);
      this.#drawLamp(context, point, radius, tokenDisplayLabel(token.token), this.#environment.uiTheme.accent);
      if (token === target) {
        const pulse = 1 + Math.sin(elapsedSeconds * 5.5) * 0.11;
        context.save();
        context.strokeStyle = "#ffd83d";
        context.lineWidth = Math.max(2.5, radius * 0.13);
        context.shadowColor = "#ffd83d";
        context.shadowBlur = radius * 0.7;
        context.beginPath();
        context.arc(point.x, point.y, radius * 1.42 * pulse, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }
    }
  }

  #drawLamp(
    context: CanvasRenderingContext2D,
    point: CanvasPoint,
    radius: number,
    label: string,
    accent: string,
  ): void {
    const gradient = context.createRadialGradient(
      point.x - radius * 0.35,
      point.y - radius * 0.42,
      radius * 0.12,
      point.x,
      point.y,
      radius,
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.28, "#aebbd2");
    gradient.addColorStop(0.62, "#53658c");
    gradient.addColorStop(1, "#182343");
    context.save();
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#050b23";
    context.beginPath();
    context.arc(point.x, point.y, radius * 0.79, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = accent;
    context.lineWidth = Math.max(1.5, radius * 0.09);
    context.beginPath();
    context.arc(point.x, point.y, radius * 0.7, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "#fffbea";
    context.font = `900 ${Math.max(11, Math.min(22, radius * 1.05))}px ui-monospace, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, point.x, point.y + 1);
    context.restore();
  }

  #drawPowerUps(
    context: CanvasRenderingContext2D,
    arena: Arena,
    metrics: PlayfieldMetrics,
    powerUps: readonly PowerUpEntity[],
    elapsedSeconds: number,
  ): void {
    for (const powerUp of powerUps) {
      const point = this.#worldToCanvas(arena.toDisplayPoint(powerUp.position), metrics);
      const radius = Math.max(12, powerUp.radius * metrics.scale * (1.08 + Math.sin(elapsedSeconds * 3.5) * 0.06));
      this.#drawLamp(
        context,
        point,
        radius,
        powerUpDisplayLabel(powerUp.kind),
        powerUp.kind.includes("MINUS") ? "#ff8e8e" : this.#environment.uiTheme.warning,
      );
    }
  }

  #drawBullets(
    context: CanvasRenderingContext2D,
    arena: Arena,
    metrics: PlayfieldMetrics,
    bullets: readonly BulletEntity[],
  ): void {
    for (const bullet of bullets) {
      const point = this.#worldToCanvas(arena.toDisplayPoint(bullet.position), metrics);
      const direction = directionVector(bullet.direction);
      context.save();
      context.strokeStyle = "rgb(255 243 166 / 50%)";
      context.lineWidth = Math.max(1, metrics.scale * 0.08);
      context.beginPath();
      context.moveTo(point.x - direction.x * metrics.scale * 0.32, point.y - direction.z * metrics.scale * 0.32);
      context.lineTo(point.x, point.y);
      context.stroke();
      context.fillStyle = "#fff3a6";
      context.shadowColor = "#fff3a6";
      context.shadowBlur = 8;
      context.beginPath();
      context.arc(point.x, point.y, Math.max(2.5, bullet.radius * metrics.scale * 1.5), 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  #drawSnake(
    context: CanvasRenderingContext2D,
    arena: Arena,
    metrics: PlayfieldMetrics,
    snake: Snake,
  ): void {
    const segments = snake.getSegmentPositions();
    const primary = hexColor(this.#environment.palette.mechaPrimaryColor);
    const secondary = hexColor(this.#environment.palette.mechaSecondaryColor);
    const glow = hexColor(this.#environment.palette.mechaGlowColor);
    for (let index = segments.length - 1; index >= 1; index -= 1) {
      const segment = segments[index];
      if (!segment) continue;
      const point = this.#worldToCanvas(arena.toDisplayPoint(segment), metrics);
      const radius = Math.max(5, metrics.scale * (index % 2 === 0 ? 0.34 : 0.29));
      context.save();
      context.fillStyle = index % 2 === 0 ? primary : secondary;
      context.strokeStyle = glow;
      context.lineWidth = Math.max(1.5, radius * 0.16);
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }
    const head = arena.toDisplayPoint(segments[0] ?? snake.headPosition);
    const headPoint = this.#worldToCanvas(head, metrics);
    const headRadius = Math.max(8, metrics.scale * 0.47);
    const forward = directionVector(snake.direction);
    // The nose triangle is drawn toward local -Y. Rotate that vector to the
    // canvas direction so NORTH points up, SOUTH down, EAST right and WEST left.
    const angle = Math.atan2(forward.x, -forward.z) + this.#backflip.pose.rotationRadians;
    const bob = this.#backflip.pose.lift * metrics.scale * 0.12;
    context.save();
    context.translate(headPoint.x, headPoint.y - bob);
    context.rotate(angle);
    context.fillStyle = primary;
    context.strokeStyle = glow;
    context.lineWidth = Math.max(2, headRadius * 0.15);
    context.beginPath();
    context.arc(0, 0, headRadius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = this.#environment.palette.mechaCanopyColor
      ? hexColor(this.#environment.palette.mechaCanopyColor)
      : "#bafcff";
    context.beginPath();
    context.arc(0, -headRadius * 0.16, headRadius * 0.42, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = glow;
    context.beginPath();
    context.moveTo(0, -headRadius * 1.38);
    context.lineTo(-headRadius * 0.38, -headRadius * 0.58);
    context.lineTo(headRadius * 0.38, -headRadius * 0.58);
    context.closePath();
    context.fill();
    context.restore();
  }

  #updateTableMotion(
    status: TableMotionStatus | null,
    elapsedSeconds: number,
    deltaSeconds: number,
  ): void {
    const mode = status?.mode ?? TableMotionMode.LEVEL;
    const shaking = mode === TableMotionMode.SHAKE;
    const targetRotation = (status?.tiltRadians ?? 0)
      + (shaking ? Math.sin(elapsedSeconds * 39) * (status?.shakeAngleRadians ?? 0) : 0);
    this.#tableRotation = damp(this.#tableRotation, targetRotation, 13, deltaSeconds);
    const targetX = shaking ? Math.sin(elapsedSeconds * 43) * 5 : 0;
    const targetY = shaking ? Math.cos(elapsedSeconds * 37) * 5 : 0;
    this.#tableOffsetX = damp(this.#tableOffsetX, targetX, 13, deltaSeconds);
    this.#tableOffsetY = damp(this.#tableOffsetY, targetY, 13, deltaSeconds);
    this.#container.dataset.tableMotion = mode;
    this.#setCanvasData("tableMotion", mode);
    this.#setCanvasData("tableTiltRadians", this.#tableRotation.toFixed(4));
  }

  #positionChecksum(
    entities: readonly { readonly position: { readonly x: number; readonly z: number } }[],
  ): string {
    return entities.reduce(
      (sum, entity, index) => sum + (index + 1) * (entity.position.x + entity.position.z * 0.5),
      0,
    ).toFixed(4);
  }
}
