import { Vector2, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.28 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - strength * smoothstep(0.25, 0.85, dot(d, d) * 2.2); gl_FragColor = vec4(c.rgb * v, c.a); }`,
};

/** High tier only (loaded lazily): light bloom, FXAA, vignette. Tone mapping happens in the OutputPass. */
export class Post {
  private readonly composer: EffectComposer;
  private readonly fxaa: ShaderPass;

  constructor(
    private readonly renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new Vector2());
    this.composer.addPass(new UnrealBloomPass(new Vector2(size.x / 2, size.y / 2), 0.22, 0.5, 0.92));
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    this.composer.addPass(new ShaderPass(VignetteShader));
    this.setSize(size.x, size.y);
  }

  setSize(w: number, h: number): void {
    const dpr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    const u = this.fxaa.material.uniforms.resolution;
    if (u) (u.value as Vector2).set(1 / (w * dpr), 1 / (h * dpr));
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
