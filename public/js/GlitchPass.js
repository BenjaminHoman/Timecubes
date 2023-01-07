import {
	DataTexture,
	FloatType,
	MathUtils,
	RedFormat,
	LuminanceFormat,
	ShaderMaterial,
	UniformsUtils
} from '/three';
import { Pass, FullScreenQuad } from './lib/Pass.js';
import { Glitch } from './shaders/Glitch.js';

class GlitchPass extends Pass {

	constructor(dt_size = 256) {
		super();
		if ( Glitch === undefined ) console.error( 'THREE.GlitchPass relies on DigitalGlitch' );
		const shader = Glitch;

		this.uniforms = UniformsUtils.clone( shader.uniforms );
		this.uniforms['tDisp'].value = this.generateNoise(dt_size);

		this.material = new ShaderMaterial( {
			uniforms: this.uniforms,
			vertexShader: shader.vertexShader,
			fragmentShader: shader.fragmentShader
		} );

		this.width = 0;
		this.fsQuad = new FullScreenQuad(this.material);
		this.time = 0;
	}

	render( renderer, writeBuffer, readBuffer, deltaTime, maskActive ) {
		if ( renderer.capabilities.isWebGL2 === false ) this.uniforms['tDisp'].value.format = LuminanceFormat;

		let whiteNoise = 0; //MathUtils.randFloat( 0, 2 );

		this.time += deltaTime;
		//this.uniforms[ 'tOffsetX' ].value = Math.sin(this.time) * (1.0/window.innerWidth) * (5 - whiteNoise); // offset is the sin of the total time elapsed normalized by the width of the screen then scaled.
		this.uniforms[ 'tOffsetX' ].value = (1.0/this.width) * (5 - whiteNoise);
		this.uniforms[ 'tDiffuse' ].value = readBuffer.texture;

		if ( this.renderToScreen ) {
			renderer.setRenderTarget( null );
			this.fsQuad.render( renderer );

		} else {
			renderer.setRenderTarget( writeBuffer );
			if ( this.clear ) renderer.clear();
			this.fsQuad.render( renderer );
		}
	}

	setSize( width, height ){
		this.width = width;
	}

	generateTrigger() {
		this.randX = MathUtils.randInt( 120, 240 );
	}

	generateHeightmap( dt_size ) {
		const data_arr = new Float32Array( dt_size * dt_size );
		const length = dt_size * dt_size;

		for ( let i = 0; i < length; i ++ ) {
			const val = MathUtils.randFloat( 0, 1 );
			data_arr[ i ] = val;
		}

		const texture = new DataTexture( data_arr, dt_size, dt_size, RedFormat, FloatType );
		texture.needsUpdate = true;
		return texture;
	}

	generateNoise( dt_size ) {
		const data_arr = new Float32Array( dt_size * dt_size );
		const perlin = new PerlinNoise();

		let i = 0;
		let fx = 0.0, fy = 0.0;
		for (let ix = 0; ix < dt_size; ix++){
			for (let iy = 0; iy < dt_size; iy++){
				data_arr[i] = perlin.get(fy, fx);
				i++;
				fy += (1.0/dt_size);
			}
			fx += (1.0/dt_size);
		}

		const texture = new DataTexture( data_arr, dt_size, dt_size, RedFormat, FloatType );
		texture.needsUpdate = true;
		return texture;
	}
}

export { GlitchPass };
