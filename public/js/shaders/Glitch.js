
const Glitch = {

	uniforms: {
		'tDiffuse': { value: null }, //diffuse texture
        'tDisp': { value: null }, //random noise
        'tOffsetX': { value: 0 },
        'tOffsetY': { value: 0 }
	},

	vertexShader: /* glsl */`

		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,

	fragmentShader: /* glsl */`
		uniform sampler2D tDiffuse;
        uniform sampler2D tDisp;

        uniform float tOffsetX;
        uniform float tOffsetY;

		varying vec2 vUv;

		void main() {
            float disp = texture2D(tDisp, vUv).r;
            vec2 offset = vec2(tOffsetX, tOffsetY);

            vec4 offsetColor = texture2D(tDiffuse, vUv + offset);
            vec4 color = texture2D(tDiffuse, vUv);
            color.r = offsetColor.r;

            gl_FragColor = color;
		}`

};

export { Glitch };
