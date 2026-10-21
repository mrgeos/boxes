// Box Studio 3D: студийный рендер (собран из src/render командой npm run build; three.js — из редактора)
(()=>{var Je=Object.create;var je=Object.defineProperty;var et=Object.getOwnPropertyDescriptor;var tt=Object.getOwnPropertyNames;var it=Object.getPrototypeOf,at=Object.prototype.hasOwnProperty;var ot=(n,e)=>()=>(e||n((e={exports:{}}).exports,e),e.exports);var rt=(n,e,t,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let a of tt(e))!at.call(n,a)&&a!==t&&je(n,a,{get:()=>e[a],enumerable:!(i=et(e,a))||i.enumerable});return n};var oe=(n,e,t)=>(t=n!=null?Je(it(n)):{},rt(e||!n||!n.__esModule?je(t,"default",{value:n,enumerable:!0}):t,n));var K=ot((dt,ke)=>{ke.exports=window.__BS_THREE});var v=oe(K(),1);var s=oe(K(),1);var Q=oe(K(),1),le=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}},st=new Q.OrthographicCamera(-1,1,1,-1,0,1),Be=class extends Q.BufferGeometry{constructor(){super(),this.setAttribute("position",new Q.Float32BufferAttribute([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new Q.Float32BufferAttribute([0,2,0,0,2,0],2))}},nt=new Be,J=class{constructor(e){this._mesh=new Q.Mesh(nt,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,st)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}};var H=oe(K(),1),De={name:"GTAOShader",defines:{PERSPECTIVE_CAMERA:1,SAMPLES:16,NORMAL_VECTOR_TYPE:1,DEPTH_SWIZZLING:"x",SCREEN_SPACE_RADIUS:0,SCREEN_SPACE_RADIUS_SCALE:100,SCENE_CLIP_BOX:0},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new H.Vector2},cameraNear:{value:null},cameraFar:{value:null},cameraProjectionMatrix:{value:new H.Matrix4},cameraProjectionMatrixInverse:{value:new H.Matrix4},cameraWorldMatrix:{value:new H.Matrix4},radius:{value:.25},distanceExponent:{value:1},thickness:{value:1},distanceFallOff:{value:1},scale:{value:1},sceneBoxMin:{value:new H.Vector3(-1,-1,-1)},sceneBoxMax:{value:new H.Vector3(1,1,1)}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		varying vec2 vUv;
		uniform highp sampler2D tNormal;
		uniform highp sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraProjectionMatrixInverse;		
		uniform mat4 cameraWorldMatrix;
		uniform float radius;
		uniform float distanceExponent;
		uniform float thickness;
		uniform float distanceFallOff;
		uniform float scale;
		#if SCENE_CLIP_BOX == 1
			uniform vec3 sceneBoxMin;
			uniform vec3 sceneBoxMax;
		#endif
		
		#include <common>
		#include <packing>

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(vec3(ao), 1.)
		#endif

		vec3 getViewPosition(const in vec2 screenPosition, const in float depth) {
			vec4 clipSpacePosition = vec4(vec3(screenPosition, depth) * 2.0 - 1.0, 1.0);
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}

		float getDepth(const vec2 uv) {  
			return textureLod(tDepth, uv.xy, 0.0).DEPTH_SWIZZLING;
		}

		float fetchDepth(const ivec2 uv) {   
			return texelFetch(tDepth, uv.xy, 0).DEPTH_SWIZZLING;
		}

		float getViewZ(const in float depth) {
			#if PERSPECTIVE_CAMERA == 1
				return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
			#else
				return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ? ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz : -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ? ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz : -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
			#if NORMAL_VECTOR_TYPE == 2
				return normalize(textureLod(tNormal, uv, 0.).rgb);
			#elif NORMAL_VECTOR_TYPE == 1
				return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
			#else
				return computeNormalFromDepth(uv);
			#endif
		}

		vec3 getSceneUvAndDepth(vec3 sampleViewPos) {
			vec4 sampleClipPos = cameraProjectionMatrix * vec4(sampleViewPos, 1.);
			vec2 sampleUv = sampleClipPos.xy / sampleClipPos.w * 0.5 + 0.5;
			float sampleSceneDepth = getDepth(sampleUv);
			return vec3(sampleUv, sampleSceneDepth);
		}
		
		void main() {
			float depth = getDepth(vUv.xy);
			if (depth >= 1.0) {
				discard;
				return;
			}
			vec3 viewPos = getViewPosition(vUv, depth);
			vec3 viewNormal = getViewNormal(vUv);

			float radiusToUse = radius;
			float distanceFalloffToUse = thickness;
			#if SCREEN_SPACE_RADIUS == 1
				float radiusScale = getViewPosition(vec2(0.5 + float(SCREEN_SPACE_RADIUS_SCALE) / resolution.x, 0.0), depth).x;
				radiusToUse *= radiusScale;
				distanceFalloffToUse *= radiusScale;
			#endif

			#if SCENE_CLIP_BOX == 1
				vec3 worldPos = (cameraWorldMatrix * vec4(viewPos, 1.0)).xyz;
				float boxDistance = length(max(vec3(0.0), max(sceneBoxMin - worldPos, worldPos - sceneBoxMax)));
				if (boxDistance > radiusToUse) {
					discard;
					return;
				}
			#endif
			
			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
			vec3 randomVec = noiseTexel.xyz * 2.0 - 1.0;
			vec3 tangent = normalize(vec3(randomVec.xy, 0.));
			vec3 bitangent = vec3(-tangent.y, tangent.x, 0.);
			mat3 kernelMatrix = mat3(tangent, bitangent, vec3(0., 0., 1.));

			const int DIRECTIONS = SAMPLES < 30 ? 3 : 5;
			const int STEPS = (SAMPLES + DIRECTIONS - 1) / DIRECTIONS;
			float ao = 0.0;
			for (int i = 0; i < DIRECTIONS; ++i) {
				
				float angle = float(i) / float(DIRECTIONS) * PI;
				vec4 sampleDir = vec4(cos(angle), sin(angle), 0., 0.5 + 0.5 * noiseTexel.w); 
				sampleDir.xyz = normalize(kernelMatrix * sampleDir.xyz);

				vec3 viewDir = normalize(-viewPos.xyz);
				vec3 sliceBitangent = normalize(cross(sampleDir.xyz, viewDir));
				vec3 sliceTangent = cross(sliceBitangent, viewDir);
				vec3 normalInSlice = normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent));
				
				vec3 tangentToNormalInSlice = cross(normalInSlice, sliceBitangent);
				vec2 cosHorizons = vec2(dot(viewDir, tangentToNormalInSlice), dot(viewDir, -tangentToNormalInSlice));
				
				for (int j = 0; j < STEPS; ++j) {
					vec3 sampleViewOffset = sampleDir.xyz * radiusToUse * sampleDir.w * pow(float(j + 1) / float(STEPS), distanceExponent);	

					vec3 sampleSceneUvDepth = getSceneUvAndDepth(viewPos + sampleViewOffset);
					vec3 sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					vec3 viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.x += max(0., (sampleCosHorizon - cosHorizons.x) * mix(1., 2. / float(j + 2), distanceFallOff));
					}		

					sampleSceneUvDepth = getSceneUvAndDepth(viewPos - sampleViewOffset);
					sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.y += max(0., (sampleCosHorizon - cosHorizons.y) * mix(1., 2. / float(j + 2), distanceFallOff));
					}
				}

				vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);
				float nx = dot(normalInSlice, sliceTangent);
				float ny = dot(normalInSlice, viewDir);
				float nxb = 1. / 2. * (acos(cosHorizons.y) - acos(cosHorizons.x) + sinHorizons.x * cosHorizons.x - sinHorizons.y * cosHorizons.y);
				float nyb = 1. / 2. * (2. - cosHorizons.x * cosHorizons.x - cosHorizons.y * cosHorizons.y);
				float occlusion = nx * nxb + ny * nyb;
				ao += occlusion;
			}

			ao = clamp(ao / float(DIRECTIONS), 0., 1.);		
		#if SCENE_CLIP_BOX == 1
			ao = mix(ao, 1., smoothstep(0., radiusToUse, boxDistance));
		#endif
			ao = pow(ao, scale);

			gl_FragColor = FRAGMENT_OUTPUT;
		}`},ye={name:"GTAODepthShader",defines:{PERSPECTIVE_CAMERA:1},uniforms:{tDepth:{value:null},cameraNear:{value:null},cameraFar:{value:null}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform sampler2D tDepth;
		uniform float cameraNear;
		uniform float cameraFar;
		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 screenPosition ) {
			#if PERSPECTIVE_CAMERA == 1
				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			#else
				return texture2D( tDepth, screenPosition ).x;
			#endif
		}

		void main() {
			float depth = getLinearDepth( vUv );
			gl_FragColor = vec4( vec3( 1.0 - depth ), 1.0 );

		}`},Ce={name:"GTAOBlendShader",uniforms:{tDiffuse:{value:null},intensity:{value:1}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform float intensity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;

		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = vec4(mix(vec3(1.), texel.rgb, intensity), texel.a);
		}`};function We(n=5){let e=Math.floor(n)%2===0?Math.floor(n)+1:Math.floor(n),t=lt(e),i=t.length,a=new Uint8Array(i*4);for(let r=0;r<i;++r){let l=t[r],d=2*Math.PI*l/i,u=new H.Vector3(Math.cos(d),Math.sin(d),0).normalize();a[r*4]=(u.x*.5+.5)*255,a[r*4+1]=(u.y*.5+.5)*255,a[r*4+2]=127,a[r*4+3]=255}let o=new H.DataTexture(a,e,e);return o.wrapS=H.RepeatWrapping,o.wrapT=H.RepeatWrapping,o.needsUpdate=!0,o}function lt(n){let e=Math.floor(n)%2===0?Math.floor(n)+1:Math.floor(n),t=e*e,i=Array(t).fill(0),a=Math.floor(e/2),o=e-1;for(let r=1;r<=t;){if(a===-1&&o===e?(o=e-2,a=0):(o===e&&(o=0),a<0&&(a=e-1)),i[a*e+o]!==0){o-=2,a++;continue}else i[a*e+o]=r++;o++,a--}return i}var ce=oe(K(),1),Ee={name:"PoissonDenoiseShader",defines:{SAMPLES:16,SAMPLE_VECTORS:Ge(16,2,1),NORMAL_VECTOR_TYPE:1,DEPTH_VALUE_SOURCE:0},uniforms:{tDiffuse:{value:null},tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new ce.Vector2},cameraProjectionMatrixInverse:{value:new ce.Matrix4},lumaPhi:{value:5},depthPhi:{value:5},normalPhi:{value:5},radius:{value:4},index:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`

		varying vec2 vUv;

		uniform sampler2D tDiffuse;
		uniform sampler2D tNormal;
		uniform sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform mat4 cameraProjectionMatrixInverse;
		uniform float lumaPhi;
		uniform float depthPhi;
		uniform float normalPhi;
		uniform float radius;
		uniform int index;
		
		#include <common>
		#include <packing>

		#ifndef SAMPLE_LUMINANCE
		#define SAMPLE_LUMINANCE dot(vec3(0.2125, 0.7154, 0.0721), a)
		#endif

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(denoised, 1.)
		#endif

		float getLuminance(const in vec3 a) {
			return SAMPLE_LUMINANCE;
		}

		const vec3 poissonDisk[SAMPLES] = SAMPLE_VECTORS;

		vec3 getViewPosition(const in vec2 screenPosition, const in float depth) {
			vec4 clipSpacePosition = vec4(vec3(screenPosition, depth) * 2.0 - 1.0, 1.0);
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}
		
		float getDepth(const vec2 uv) {
		#if DEPTH_VALUE_SOURCE == 1    
			return textureLod(tDepth, uv.xy, 0.0).a;
		#else
			return textureLod(tDepth, uv.xy, 0.0).r;
		#endif
		}

		float fetchDepth(const ivec2 uv) {
			#if DEPTH_VALUE_SOURCE == 1    
				return texelFetch(tDepth, uv.xy, 0).a;
			#else
				return texelFetch(tDepth, uv.xy, 0).r;
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ?  ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz
									: -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ?  ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz
									: -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
		#if NORMAL_VECTOR_TYPE == 2
			return normalize(textureLod(tNormal, uv, 0.).rgb);
		#elif NORMAL_VECTOR_TYPE == 1
			return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
		#else
			return computeNormalFromDepth(uv);
		#endif
		}

		void denoiseSample(in vec3 center, in vec3 viewNormal, in vec3 viewPos, in vec2 sampleUv, inout vec3 denoised, inout float totalWeight) {
			vec4 sampleTexel = textureLod(tDiffuse, sampleUv, 0.0);
			float sampleDepth = getDepth(sampleUv);
			vec3 sampleNormal = getViewNormal(sampleUv);
			vec3 neighborColor = sampleTexel.rgb;
			vec3 viewPosSample = getViewPosition(sampleUv, sampleDepth);
			
			float normalDiff = dot(viewNormal, sampleNormal);
			float normalSimilarity = pow(max(normalDiff, 0.), normalPhi);
			float lumaDiff = abs(getLuminance(neighborColor) - getLuminance(center));
			float lumaSimilarity = max(1.0 - lumaDiff / lumaPhi, 0.0);
			float depthDiff = abs(dot(viewPos - viewPosSample, viewNormal));
			float depthSimilarity = max(1. - depthDiff / depthPhi, 0.);
			float w = lumaSimilarity * depthSimilarity * normalSimilarity;
		
			denoised += w * neighborColor;
			totalWeight += w;
		}
		
		void main() {
			float depth = getDepth(vUv.xy);	
			vec3 viewNormal = getViewNormal(vUv);	
			if (depth == 1. || dot(viewNormal, viewNormal) == 0.) {
				discard;
				return;
			}
			vec4 texel = textureLod(tDiffuse, vUv, 0.0);
			vec3 center = texel.rgb;
			vec3 viewPos = getViewPosition(vUv, depth);

			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
      		vec2 noiseVec = vec2(sin(noiseTexel[index % 4] * 2. * PI), cos(noiseTexel[index % 4] * 2. * PI));
    		mat2 rotationMatrix = mat2(noiseVec.x, -noiseVec.y, noiseVec.x, noiseVec.y);
		
			float totalWeight = 1.0;
			vec3 denoised = texel.rgb;
			for (int i = 0; i < SAMPLES; i++) {
				vec3 sampleDir = poissonDisk[i];
				vec2 offset = rotationMatrix * (sampleDir.xy * (1. + sampleDir.z * (radius - 1.)) / resolution);
				vec2 sampleUv = vUv + offset;
				denoiseSample(center, viewNormal, viewPos, sampleUv, denoised, totalWeight);
			}
		
			if (totalWeight > 0.) { 
				denoised /= totalWeight;
			}
			gl_FragColor = FRAGMENT_OUTPUT;
		}`};function Ge(n,e,t){let i=ct(n,e,t),a="vec3[SAMPLES](";for(let o=0;o<n;o++){let r=i[o];a+=`vec3(${r.x}, ${r.y}, ${r.z})${o<n-1?",":")"}`}return a}function ct(n,e,t){let i=[];for(let a=0;a<n;a++){let o=2*Math.PI*e*a/n,r=Math.pow(a/(n-1),t);i.push(new ce.Vector3(Math.cos(o),Math.sin(o),r))}return i}var ue={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};var Ue=class{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let t=0;t<256;t++)this.p[t]=Math.floor(e.random()*256);this.perm=[];for(let t=0;t<512;t++)this.perm[t]=this.p[t&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}dot(e,t,i){return e[0]*t+e[1]*i}dot3(e,t,i,a){return e[0]*t+e[1]*i+e[2]*a}dot4(e,t,i,a,o){return e[0]*t+e[1]*i+e[2]*a+e[3]*o}noise(e,t){let i,a,o,r=.5*(Math.sqrt(3)-1),l=(e+t)*r,d=Math.floor(e+l),u=Math.floor(t+l),b=(3-Math.sqrt(3))/6,T=(d+u)*b,z=d-T,g=u-T,D=e-z,C=t-g,A,O;D>C?(A=1,O=0):(A=0,O=1);let U=D-A+b,y=C-O+b,E=D-1+2*b,R=C-1+2*b,x=d&255,I=u&255,V=this.perm[x+this.perm[I]]%12,S=this.perm[x+A+this.perm[I+O]]%12,M=this.perm[x+1+this.perm[I+1]]%12,w=.5-D*D-C*C;w<0?i=0:(w*=w,i=w*w*this.dot(this.grad3[V],D,C));let P=.5-U*U-y*y;P<0?a=0:(P*=P,a=P*P*this.dot(this.grad3[S],U,y));let _=.5-E*E-R*R;return _<0?o=0:(_*=_,o=_*_*this.dot(this.grad3[M],E,R)),70*(i+a+o)}noise3d(e,t,i){let a,o,r,l,u=(e+t+i)*.3333333333333333,b=Math.floor(e+u),T=Math.floor(t+u),z=Math.floor(i+u),g=1/6,D=(b+T+z)*g,C=b-D,A=T-D,O=z-D,U=e-C,y=t-A,E=i-O,R,x,I,V,S,M;U>=y?y>=E?(R=1,x=0,I=0,V=1,S=1,M=0):U>=E?(R=1,x=0,I=0,V=1,S=0,M=1):(R=0,x=0,I=1,V=1,S=0,M=1):y<E?(R=0,x=0,I=1,V=0,S=1,M=1):U<E?(R=0,x=1,I=0,V=0,S=1,M=1):(R=0,x=1,I=0,V=1,S=1,M=0);let w=U-R+g,P=y-x+g,_=E-I+g,X=U-V+2*g,Y=y-S+2*g,$=E-M+2*g,te=U-1+3*g,ie=y-1+3*g,F=E-1+3*g,G=b&255,L=T&255,B=z&255,ae=this.perm[G+this.perm[L+this.perm[B]]]%12,re=this.perm[G+R+this.perm[L+x+this.perm[B+I]]]%12,se=this.perm[G+V+this.perm[L+S+this.perm[B+M]]]%12,ne=this.perm[G+1+this.perm[L+1+this.perm[B+1]]]%12,j=.6-U*U-y*y-E*E;j<0?a=0:(j*=j,a=j*j*this.dot3(this.grad3[ae],U,y,E));let k=.6-w*w-P*P-_*_;k<0?o=0:(k*=k,o=k*k*this.dot3(this.grad3[re],w,P,_));let W=.6-X*X-Y*Y-$*$;W<0?r=0:(W*=W,r=W*W*this.dot3(this.grad3[se],X,Y,$));let q=.6-te*te-ie*ie-F*F;return q<0?l=0:(q*=q,l=q*q*this.dot3(this.grad3[ne],te,ie,F)),32*(a+o+r+l)}noise4d(e,t,i,a){let o=this.grad4,r=this.simplex,l=this.perm,d=(Math.sqrt(5)-1)/4,u=(5-Math.sqrt(5))/20,b,T,z,g,D,C=(e+t+i+a)*d,A=Math.floor(e+C),O=Math.floor(t+C),U=Math.floor(i+C),y=Math.floor(a+C),E=(A+O+U+y)*u,R=A-E,x=O-E,I=U-E,V=y-E,S=e-R,M=t-x,w=i-I,P=a-V,_=S>M?32:0,X=S>w?16:0,Y=M>w?8:0,$=S>P?4:0,te=M>P?2:0,ie=w>P?1:0,F=_+X+Y+$+te+ie,G=r[F][0]>=3?1:0,L=r[F][1]>=3?1:0,B=r[F][2]>=3?1:0,ae=r[F][3]>=3?1:0,re=r[F][0]>=2?1:0,se=r[F][1]>=2?1:0,ne=r[F][2]>=2?1:0,j=r[F][3]>=2?1:0,k=r[F][0]>=1?1:0,W=r[F][1]>=1?1:0,q=r[F][2]>=1?1:0,Ae=r[F][3]>=1?1:0,c=S-G+u,f=M-L+u,p=w-B+u,m=P-ae+u,N=S-re+2*u,de=M-se+2*u,ve=w-ne+2*u,Z=P-j+2*u,me=S-k+3*u,Ve=M-W+3*u,Fe=w-q+3*u,ze=P-Ae+3*u,Oe=S-1+4*u,Ie=M-1+4*u,He=w-1+4*u,Le=P-1+4*u,pe=A&255,ge=O&255,xe=U&255,Me=y&255,Qe=l[pe+l[ge+l[xe+l[Me]]]]%32,Xe=l[pe+G+l[ge+L+l[xe+B+l[Me+ae]]]]%32,Ye=l[pe+re+l[ge+se+l[xe+ne+l[Me+j]]]]%32,$e=l[pe+k+l[ge+W+l[xe+q+l[Me+Ae]]]]%32,Ke=l[pe+1+l[ge+1+l[xe+1+l[Me+1]]]]%32,Te=.6-S*S-M*M-w*w-P*P;Te<0?b=0:(Te*=Te,b=Te*Te*this.dot4(o[Qe],S,M,w,P));let Se=.6-c*c-f*f-p*p-m*m;Se<0?T=0:(Se*=Se,T=Se*Se*this.dot4(o[Xe],c,f,p,m));let we=.6-N*N-de*de-ve*ve-Z*Z;we<0?z=0:(we*=we,z=we*we*this.dot4(o[Ye],N,de,ve,Z));let Pe=.6-me*me-Ve*Ve-Fe*Fe-ze*ze;Pe<0?g=0:(Pe*=Pe,g=Pe*Pe*this.dot4(o[$e],me,Ve,Fe,ze));let be=.6-Oe*Oe-Ie*Ie-He*He-Le*Le;return be<0?D=0:(be*=be,D=be*be*this.dot4(o[Ke],Oe,Ie,He,Le)),27*(b+T+z+g+D)}};var he=class n extends le{constructor(e,t,i,a,o,r,l){super(),this.width=i!==void 0?i:512,this.height=a!==void 0?a:512,this.clear=!0,this.camera=t,this.scene=e,this.output=0,this._renderGBuffer=!0,this._visibilityCache=new Map,this.blendIntensity=1,this.pdRings=2,this.pdRadiusExponent=2,this.pdSamples=16,this.gtaoNoiseTexture=We(),this.pdNoiseTexture=this.generateNoise(),this.gtaoRenderTarget=new s.WebGLRenderTarget(this.width,this.height,{type:s.HalfFloatType}),this.pdRenderTarget=this.gtaoRenderTarget.clone(),this.gtaoMaterial=new s.ShaderMaterial({defines:Object.assign({},De.defines),uniforms:s.UniformsUtils.clone(De.uniforms),vertexShader:De.vertexShader,fragmentShader:De.fragmentShader,blending:s.NoBlending,depthTest:!1,depthWrite:!1}),this.gtaoMaterial.defines.PERSPECTIVE_CAMERA=this.camera.isPerspectiveCamera?1:0,this.gtaoMaterial.uniforms.tNoise.value=this.gtaoNoiseTexture,this.gtaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.normalMaterial=new s.MeshNormalMaterial,this.normalMaterial.blending=s.NoBlending,this.pdMaterial=new s.ShaderMaterial({defines:Object.assign({},Ee.defines),uniforms:s.UniformsUtils.clone(Ee.uniforms),vertexShader:Ee.vertexShader,fragmentShader:Ee.fragmentShader,depthTest:!1,depthWrite:!1}),this.pdMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.pdMaterial.uniforms.tNoise.value=this.pdNoiseTexture,this.pdMaterial.uniforms.resolution.value.set(this.width,this.height),this.pdMaterial.uniforms.lumaPhi.value=10,this.pdMaterial.uniforms.depthPhi.value=2,this.pdMaterial.uniforms.normalPhi.value=3,this.pdMaterial.uniforms.radius.value=8,this.depthRenderMaterial=new s.ShaderMaterial({defines:Object.assign({},ye.defines),uniforms:s.UniformsUtils.clone(ye.uniforms),vertexShader:ye.vertexShader,fragmentShader:ye.fragmentShader,blending:s.NoBlending}),this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new s.ShaderMaterial({uniforms:s.UniformsUtils.clone(ue.uniforms),vertexShader:ue.vertexShader,fragmentShader:ue.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:s.DstColorFactor,blendDst:s.ZeroFactor,blendEquation:s.AddEquation,blendSrcAlpha:s.DstAlphaFactor,blendDstAlpha:s.ZeroFactor,blendEquationAlpha:s.AddEquation}),this.blendMaterial=new s.ShaderMaterial({uniforms:s.UniformsUtils.clone(Ce.uniforms),vertexShader:Ce.vertexShader,fragmentShader:Ce.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blending:s.CustomBlending,blendSrc:s.DstColorFactor,blendDst:s.ZeroFactor,blendEquation:s.AddEquation,blendSrcAlpha:s.DstAlphaFactor,blendDstAlpha:s.ZeroFactor,blendEquationAlpha:s.AddEquation}),this.fsQuad=new J(null),this.originalClearColor=new s.Color,this.setGBuffer(o?o.depthTexture:void 0,o?o.normalTexture:void 0),r!==void 0&&this.updateGtaoMaterial(r),l!==void 0&&this.updatePdMaterial(l)}dispose(){this.gtaoNoiseTexture.dispose(),this.pdNoiseTexture.dispose(),this.normalRenderTarget.dispose(),this.gtaoRenderTarget.dispose(),this.pdRenderTarget.dispose(),this.normalMaterial.dispose(),this.pdMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this.fsQuad.dispose()}get gtaoMap(){return this.pdRenderTarget.texture}setGBuffer(e,t){e!==void 0?(this.depthTexture=e,this.normalTexture=t,this._renderGBuffer=!1):(this.depthTexture=new s.DepthTexture,this.depthTexture.format=s.DepthStencilFormat,this.depthTexture.type=s.UnsignedInt248Type,this.normalRenderTarget=new s.WebGLRenderTarget(this.width,this.height,{minFilter:s.NearestFilter,magFilter:s.NearestFilter,type:s.HalfFloatType,depthTexture:this.depthTexture}),this.normalTexture=this.normalRenderTarget.texture,this._renderGBuffer=!0);let i=this.normalTexture?1:0,a=this.depthTexture===this.normalTexture?"w":"x";this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE=i,this.gtaoMaterial.defines.DEPTH_SWIZZLING=a,this.gtaoMaterial.uniforms.tNormal.value=this.normalTexture,this.gtaoMaterial.uniforms.tDepth.value=this.depthTexture,this.pdMaterial.defines.NORMAL_VECTOR_TYPE=i,this.pdMaterial.defines.DEPTH_SWIZZLING=a,this.pdMaterial.uniforms.tNormal.value=this.normalTexture,this.pdMaterial.uniforms.tDepth.value=this.depthTexture,this.depthRenderMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture}setSceneClipBox(e){e?(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX!==1,this.gtaoMaterial.defines.SCENE_CLIP_BOX=1,this.gtaoMaterial.uniforms.sceneBoxMin.value.copy(e.min),this.gtaoMaterial.uniforms.sceneBoxMax.value.copy(e.max)):(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX===0,this.gtaoMaterial.defines.SCENE_CLIP_BOX=0)}updateGtaoMaterial(e){e.radius!==void 0&&(this.gtaoMaterial.uniforms.radius.value=e.radius),e.distanceExponent!==void 0&&(this.gtaoMaterial.uniforms.distanceExponent.value=e.distanceExponent),e.thickness!==void 0&&(this.gtaoMaterial.uniforms.thickness.value=e.thickness),e.distanceFallOff!==void 0&&(this.gtaoMaterial.uniforms.distanceFallOff.value=e.distanceFallOff,this.gtaoMaterial.needsUpdate=!0),e.scale!==void 0&&(this.gtaoMaterial.uniforms.scale.value=e.scale),e.samples!==void 0&&e.samples!==this.gtaoMaterial.defines.SAMPLES&&(this.gtaoMaterial.defines.SAMPLES=e.samples,this.gtaoMaterial.needsUpdate=!0),e.screenSpaceRadius!==void 0&&(e.screenSpaceRadius?1:0)!==this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS&&(this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS=e.screenSpaceRadius?1:0,this.gtaoMaterial.needsUpdate=!0)}updatePdMaterial(e){let t=!1;e.lumaPhi!==void 0&&(this.pdMaterial.uniforms.lumaPhi.value=e.lumaPhi),e.depthPhi!==void 0&&(this.pdMaterial.uniforms.depthPhi.value=e.depthPhi),e.normalPhi!==void 0&&(this.pdMaterial.uniforms.normalPhi.value=e.normalPhi),e.radius!==void 0&&e.radius!==this.radius&&(this.pdMaterial.uniforms.radius.value=e.radius),e.radiusExponent!==void 0&&e.radiusExponent!==this.pdRadiusExponent&&(this.pdRadiusExponent=e.radiusExponent,t=!0),e.rings!==void 0&&e.rings!==this.pdRings&&(this.pdRings=e.rings,t=!0),e.samples!==void 0&&e.samples!==this.pdSamples&&(this.pdSamples=e.samples,t=!0),t&&(this.pdMaterial.defines.SAMPLES=this.pdSamples,this.pdMaterial.defines.SAMPLE_VECTORS=Ge(this.pdSamples,this.pdRings,this.pdRadiusExponent),this.pdMaterial.needsUpdate=!0)}render(e,t,i){switch(this._renderGBuffer&&(this.overrideVisibility(),this.renderOverride(e,this.normalMaterial,this.normalRenderTarget,7829503,1),this.restoreVisibility()),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy(this.camera.matrixWorld),this.renderPass(e,this.gtaoMaterial,this.gtaoRenderTarget,16777215,1),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.renderPass(e,this.pdMaterial,this.pdRenderTarget,16777215,1),this.output){case n.OUTPUT.Off:break;case n.OUTPUT.Diffuse:this.copyMaterial.uniforms.tDiffuse.value=i.texture,this.copyMaterial.blending=s.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case n.OUTPUT.AO:this.copyMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.copyMaterial.blending=s.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case n.OUTPUT.Denoise:this.copyMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.copyMaterial.blending=s.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case n.OUTPUT.Depth:this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.renderPass(e,this.depthRenderMaterial,this.renderToScreen?null:t);break;case n.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalRenderTarget.texture,this.copyMaterial.blending=s.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case n.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=i.texture,this.copyMaterial.blending=s.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t),this.blendMaterial.uniforms.intensity.value=this.blendIntensity,this.blendMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.renderPass(e,this.blendMaterial,this.renderToScreen?null:t);break;default:console.warn("THREE.GTAOPass: Unknown output type.")}}renderPass(e,t,i,a,o){e.getClearColor(this.originalClearColor);let r=e.getClearAlpha(),l=e.autoClear;e.setRenderTarget(i),e.autoClear=!1,a!=null&&(e.setClearColor(a),e.setClearAlpha(o||0),e.clear()),this.fsQuad.material=t,this.fsQuad.render(e),e.autoClear=l,e.setClearColor(this.originalClearColor),e.setClearAlpha(r)}renderOverride(e,t,i,a,o){e.getClearColor(this.originalClearColor);let r=e.getClearAlpha(),l=e.autoClear;e.setRenderTarget(i),e.autoClear=!1,a=t.clearColor||a,o=t.clearAlpha||o,a!=null&&(e.setClearColor(a),e.setClearAlpha(o||0),e.clear()),this.scene.overrideMaterial=t,e.render(this.scene,this.camera),this.scene.overrideMaterial=null,e.autoClear=l,e.setClearColor(this.originalClearColor),e.setClearAlpha(r)}setSize(e,t){this.width=e,this.height=t,this.gtaoRenderTarget.setSize(e,t),this.normalRenderTarget.setSize(e,t),this.pdRenderTarget.setSize(e,t),this.gtaoMaterial.uniforms.resolution.value.set(e,t),this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.pdMaterial.uniforms.resolution.value.set(e,t),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)}overrideVisibility(){let e=this.scene,t=this._visibilityCache;e.traverse(function(i){t.set(i,i.visible),(i.isPoints||i.isLine)&&(i.visible=!1)})}restoreVisibility(){let e=this.scene,t=this._visibilityCache;e.traverse(function(i){let a=t.get(i);i.visible=a}),t.clear()}generateNoise(e=64){let t=new Ue,i=e*e*4,a=new Uint8Array(i);for(let r=0;r<e;r++)for(let l=0;l<e;l++){let d=r,u=l;a[(r*e+l)*4]=(t.noise(d,u)*.5+.5)*255,a[(r*e+l)*4+1]=(t.noise(d+e,u)*.5+.5)*255,a[(r*e+l)*4+2]=(t.noise(d,u+e)*.5+.5)*255,a[(r*e+l)*4+3]=(t.noise(d+e,u+e)*.5+.5)*255}let o=new s.DataTexture(a,e,e,s.RGBAFormat,s.UnsignedByteType);return o.wrapS=s.RepeatWrapping,o.wrapT=s.RepeatWrapping,o.needsUpdate=!0,o}};he.OUTPUT={Off:-1,Default:0,Diffuse:1,Depth:2,Normal:3,AO:4,Denoise:5};var h=oe(K(),1);var Ze=oe(K(),1),qe={name:"LuminosityHighPassShader",shaderID:"luminosityHighPass",uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new Ze.Color(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`};var fe=class n extends le{constructor(e,t,i,a){super(),this.strength=t!==void 0?t:1,this.radius=i,this.threshold=a,this.resolution=e!==void 0?new h.Vector2(e.x,e.y):new h.Vector2(256,256),this.clearColor=new h.Color(0,0,0),this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let o=Math.round(this.resolution.x/2),r=Math.round(this.resolution.y/2);this.renderTargetBright=new h.WebGLRenderTarget(o,r,{type:h.HalfFloatType}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let T=0;T<this.nMips;T++){let z=new h.WebGLRenderTarget(o,r,{type:h.HalfFloatType});z.texture.name="UnrealBloomPass.h"+T,z.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(z);let g=new h.WebGLRenderTarget(o,r,{type:h.HalfFloatType});g.texture.name="UnrealBloomPass.v"+T,g.texture.generateMipmaps=!1,this.renderTargetsVertical.push(g),o=Math.round(o/2),r=Math.round(r/2)}let l=qe;this.highPassUniforms=h.UniformsUtils.clone(l.uniforms),this.highPassUniforms.luminosityThreshold.value=a,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new h.ShaderMaterial({uniforms:this.highPassUniforms,vertexShader:l.vertexShader,fragmentShader:l.fragmentShader}),this.separableBlurMaterials=[];let d=[3,5,7,9,11];o=Math.round(this.resolution.x/2),r=Math.round(this.resolution.y/2);for(let T=0;T<this.nMips;T++)this.separableBlurMaterials.push(this.getSeperableBlurMaterial(d[T])),this.separableBlurMaterials[T].uniforms.invSize.value=new h.Vector2(1/o,1/r),o=Math.round(o/2),r=Math.round(r/2);this.compositeMaterial=this.getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let u=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=u,this.bloomTintColors=[new h.Vector3(1,1,1),new h.Vector3(1,1,1),new h.Vector3(1,1,1),new h.Vector3(1,1,1),new h.Vector3(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;let b=ue;this.copyUniforms=h.UniformsUtils.clone(b.uniforms),this.blendMaterial=new h.ShaderMaterial({uniforms:this.copyUniforms,vertexShader:b.vertexShader,fragmentShader:b.fragmentShader,blending:h.AdditiveBlending,depthTest:!1,depthWrite:!1,transparent:!0}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new h.Color,this.oldClearAlpha=1,this.basic=new h.MeshBasicMaterial,this.fsQuad=new J(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this.basic.dispose(),this.fsQuad.dispose()}setSize(e,t){let i=Math.round(e/2),a=Math.round(t/2);this.renderTargetBright.setSize(i,a);for(let o=0;o<this.nMips;o++)this.renderTargetsHorizontal[o].setSize(i,a),this.renderTargetsVertical[o].setSize(i,a),this.separableBlurMaterials[o].uniforms.invSize.value=new h.Vector2(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2)}render(e,t,i,a,o){e.getClearColor(this._oldClearColor),this.oldClearAlpha=e.getClearAlpha();let r=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),o&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this.fsQuad.material=this.basic,this.basic.map=i.texture,e.setRenderTarget(null),e.clear(),this.fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=i.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this.fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this.fsQuad.render(e);let l=this.renderTargetBright;for(let d=0;d<this.nMips;d++)this.fsQuad.material=this.separableBlurMaterials[d],this.separableBlurMaterials[d].uniforms.colorTexture.value=l.texture,this.separableBlurMaterials[d].uniforms.direction.value=n.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[d]),e.clear(),this.fsQuad.render(e),this.separableBlurMaterials[d].uniforms.colorTexture.value=this.renderTargetsHorizontal[d].texture,this.separableBlurMaterials[d].uniforms.direction.value=n.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[d]),e.clear(),this.fsQuad.render(e),l=this.renderTargetsVertical[d];this.fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,o&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(i),this.fsQuad.render(e)),e.setClearColor(this._oldClearColor,this.oldClearAlpha),e.autoClear=r}getSeperableBlurMaterial(e){let t=[];for(let i=0;i<e;i++)t.push(.39894*Math.exp(-.5*i*i/(e*e))/e);return new h.ShaderMaterial({defines:{KERNEL_RADIUS:e},uniforms:{colorTexture:{value:null},invSize:{value:new h.Vector2(.5,.5)},direction:{value:new h.Vector2(.5,.5)},gaussianCoefficients:{value:t}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {
					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`})}getCompositeMaterial(e){return new h.ShaderMaterial({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`})}};fe.BlurDirectionX=new h.Vector2(1,0);fe.BlurDirectionY=new h.Vector2(0,1);var ee={ao:.6,bloom:.3,vig:0,vigExport:.3,grain:.12,contrast:.06,keyR:.07},Re=(n,e)=>{let t=1,i=0;for(;n>0;)t/=e,i+=t*(n%e),n=Math.floor(n/e);return i},Ne="bool bad(vec3 v){ return !(abs(v.x) < 1e5 && abs(v.y) < 1e5 && abs(v.z) < 1e5); }   // true for NaN and Inf too",ut="varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",_e=(n,e)=>new v.ShaderMaterial({vertexShader:ut,fragmentShader:n,uniforms:e,depthTest:!1,depthWrite:!1,blending:v.NoBlending});function ht(n){let{renderer:e,scene:t,camera:i,key:a,viewport:o}=n,r=!!window.__forceLow||matchMedia("(pointer: coarse)").matches||Math.min(innerWidth,innerHeight)<500,l=!window.__forceHalf&&e.extensions.has("EXT_color_buffer_float")?v.FloatType:v.HalfFloatType,d=+new URLSearchParams(location.search).get("n")||Math.min(r?16:64,l===v.FloatType?64:32),u=(c,f={})=>new v.WebGLRenderTarget(1,1,{type:c,depthBuffer:!1,...f}),b=u(v.HalfFloatType,{samples:r?0:4,depthBuffer:!0}),T=u(v.HalfFloatType),z=u(v.HalfFloatType),g=[0,1].map(()=>u(l,{minFilter:v.NearestFilter,magFilter:v.NearestFilter})),D=0,C=1,A=1,O=0,U=0,y=!1,E=new J(null),R=(c,f)=>{E.material=c,e.setRenderTarget(f),E.render(e)},x=new he(t,i,1,1);x.output=he.OUTPUT.Off,x.normalMaterial.side=v.DoubleSide,x.updatePdMaterial({radius:6});let I=(c,f,p)=>{c.fragmentShader.includes(f)||console.warn("GTAO noise patch missed"),c.fragmentShader=c.fragmentShader.replace("uniform sampler2D tNoise;","uniform sampler2D tNoise; uniform float uFrame;").split(f).join(f+p),c.uniforms.uFrame={value:0},c.needsUpdate=!0};I(x.gtaoMaterial,"vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);","vec2 nd = noiseTexel.xy * 2.0 - 1.0; float na = atan(nd.y, nd.x) + uFrame * 2.399963; noiseTexel.xy = vec2(cos(na), sin(na)) * 0.5 + 0.5; noiseTexel.w = fract(noiseTexel.w + uFrame * 0.7548777);"),I(x.pdMaterial,"vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);","noiseTexel = fract(noiseTexel + uFrame * 0.618034);");let V=new fe(new v.Vector2(1,1),ee.bloom,.7,6);V.highPassUniforms.smoothWidth.value=.6;let S=_e(`uniform sampler2D tScene, tAO, tNormal; uniform float uAO, uInject, uGuard; uniform mat4 uCam; varying vec2 vUv;
${Ne}
void main(){
  vec4 c = texture2D(tScene, vUv);
  if (uInject > .5) { vec2 g = floor(gl_FragCoord.xy / 6.); float h = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453); if (h > .997) c.rgb = vec3(sqrt(-uInject), 1e30 * uInject, 1. / (uInject - 1.)); }   // debug: NaN / Inf blocks
  float ao = texture2D(tAO, vUv).r;
  if (uGuard > .5 && !(ao >= 0. && ao <= 1.)) ao = 1.;   // NaN -> no occlusion
  float k = exp(log(max(ao, 1e-3)) * uAO);
  vec3 nv = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
  vec3 n = (uCam * vec4(nv, 0.0)).xyz; n = dot(n, n) > 1e-8 ? normalize(n) : vec3(0.);
  float floorM = smoothstep(.9, .98, n.y);
  vec4 o = vec4(c.rgb * k, c.a + (1.0 - c.a) * (1.0 - k) * floorM);
  if (uGuard > .5) { if (bad(o.rgb) || !(o.a == o.a)) o = vec4(0., 0., 0., -1.); else o = vec4(clamp(o.rgb, 0., 32.), clamp(o.a, 0., 1.)); }   // alpha -1 marks a bad texel: the average ignores it
  gl_FragColor = o;
}`,{uInject:{value:0},uGuard:{value:1},tScene:{value:null},tAO:{value:null},tNormal:{value:null},uAO:{value:ee.ao*2},uCam:{value:new v.Matrix4}}),M=_e(`uniform sampler2D tPrev, tNew; uniform float uW, uGuard; varying vec2 vUv;
${Ne}
void main(){
  vec4 p = texture2D(tPrev, vUv), n = texture2D(tNew, vUv);
  if (uGuard > .5) {
    bool nb = n.a < 0. || bad(n.rgb) || !(n.a == n.a), pb = bad(p.rgb) || !(p.a == p.a);
    if (nb && pb) { gl_FragColor = vec4(0.); return; }
    if (nb) { gl_FragColor = uW >= 1. ? vec4(0.) : p; return; }   // a bad new texel: keep the average as it was
    if (pb) { gl_FragColor = n; return; }
  }
  gl_FragColor = mix(p, n, uW);
}`,{uGuard:{value:1},tPrev:{value:null},tNew:{value:null},uW:{value:1}}),w=_e(`uniform sampler2D tMap; uniform float uGuard; varying vec2 vUv;
${Ne}
void main(){ vec4 t = texture2D(tMap, vUv); if (uGuard > .5) t = (bad(t.rgb) || !(t.a == t.a)) ? vec4(0.) : vec4(clamp(t.rgb, 0., 64.), clamp(t.a, 0., 1.)); gl_FragColor = t; }   // keeps one hot texel from flooding the bloom mips
`,{uGuard:{value:1},tMap:{value:null}}),P=new v.DataTexture(new Uint8Array([0,0,0,0]),1,1);P.needsUpdate=!0;let _=_e(`precision highp float;
uniform sampler2D tAcc, tGlow; uniform float uVig, uGrain, uCon; varying vec2 vUv;
#include <tonemapping_pars_fragment>
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
${Ne}
void main(){
  vec4 t = texture2D(tAcc, vUv);
  if (bad(t.rgb) || !(t.a == t.a)) t = vec4(0.);
  float a = clamp(t.a, 0., 1.);
  vec3 obj = a > 1e-3 ? min(t.rgb / a, vec3(64.)) : vec3(0.);
  vec3 gl = texture2D(tGlow, vUv).rgb; if (bad(gl)) gl = vec3(0.); gl = clamp(gl, 0., 64.);
  vec3 g = NeutralToneMapping(gl);
  vec3 col = pow(NeutralToneMapping(max(obj, 0.)), vec3(1. + uCon)) * a + g;
  float al = clamp(max(a, max(g.r, max(g.g, g.b))), 0., 1.);
  float v = uVig * smoothstep(.45, 1.35, length((vUv - .5) * 2.));
  col *= 1. - v; al += (1. - al) * v;
  vec3 un = al > 1e-4 ? clamp(col / al, 0., 1.) : vec3(0.);
  vec3 o = sRGBTransferOETF(vec4(un, 1.)).rgb;
  float n = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.3) - 1.;
  float l = dot(o, vec3(.299, .587, .114));
  o = clamp(o + n * (uGrain * .05 * (1. - .6 * abs(l * 2. - 1.)) + 1. / 255.), 0., 1.);
  gl_FragColor = vec4(o * al, al);
}`,{tAcc:{value:null},tGlow:{value:null},uVig:{value:ee.vig},uGrain:{value:ee.grain},uCon:{value:ee.contrast}});_.toneMapped=!1;function X(c,f){C=c,A=f,O=0;let p=r?.5:1;for(let m of[b,T,z,...g])m.setSize(C,A);x.setSize(Math.round(C*p),Math.round(A*p)),x.updateGtaoMaterial({samples:r?12:24,radius:.14,thickness:.35,distanceExponent:1}),V.setSize(C,A)}function Y(c){let f=[];return t.traverse(p=>{p.isMesh&&p.visible&&c(p)&&(p.visible=!1,f.push(p))}),()=>f.forEach(p=>{p.visible=!0})}let $=c=>[c.material].flat().filter(Boolean),te=c=>$(c).some(f=>f.transparent&&!f.depthWrite||f.alphaTest>.4),ie=c=>c.material===n.contactMat;function F(c){let f=o.clientWidth,p=o.clientHeight,m=e.getPixelRatio(),N=i.view?.enabled?i.view:null;i.setViewOffset(f,p,(N?N.offsetX:0)+(Re(c+1,2)-.5)/m,(N?N.offsetY:0)+(Re(c+1,3)-.5)/m,f,p)}let G=new v.Vector3,L=new v.Vector3,B=new v.Vector3,ae=new v.Vector3;function re(c){G.copy(a.position),L.copy(G).sub(a.target.position);let f=L.length();L.normalize(),B.crossVectors(L,Math.abs(L.y)>.95?new v.Vector3(1,0,0):new v.Vector3(0,1,0)).normalize(),ae.crossVectors(L,B);let p=f*ee.keyR*Math.sqrt(Re(c+1,5)),m=2*Math.PI*Re(c+1,7);a.position.addScaledVector(B,p*Math.cos(m)).addScaledVector(ae,p*Math.sin(m))}function se(c){let f=performance.now(),p=a.position.clone(),m=i.view?.enabled?{...i.view}:null,N=a.shadow.radius;c&&(F(c),re(c),a.shadow.radius=Math.max(1,N*.5)),e.shadowMap.needsUpdate=!0,y=!0;let de=Y(ie);e.setRenderTarget(b),e.render(t,i),x.gtaoMaterial.uniforms.uFrame.value=x.pdMaterial.uniforms.uFrame.value=c;let ve=Y(te);x.render(e,null,null),ve(),de();let Z=S.uniforms;Z.tScene.value=b.texture,Z.tAO.value=x.gtaoMap,Z.tNormal.value=x.normalRenderTarget.texture;let me=window.__noGuard?0:1;Z.uGuard.value=M.uniforms.uGuard.value=w.uniforms.uGuard.value=me,Z.uInject.value=window.__inject===c?1:0,Z.uCam.value.copy(i.matrixWorld),R(S,T),M.uniforms.tPrev.value=g[D].texture,M.uniforms.tNew.value=T.texture,M.uniforms.uW.value=1/(c+1),R(M,g[1-D]),D=1-D,m?i.setViewOffset(m.fullWidth,m.fullHeight,m.offsetX,m.offsetY,m.width,m.height):i.clearViewOffset(),a.position.copy(p),a.shadow.radius=N,window.__studioSync&&e.readRenderTargetPixels(g[D],0,0,1,1,new Float32Array(4)),U=performance.now()-f}function ne(){let c=P;ee.bloom>0&&(w.uniforms.tMap.value=g[D].texture,R(w,z),V.strength=ee.bloom*1.2,V.render(e,null,z,0,!1),c=V.renderTargetsHorizontal[0].texture),_.uniforms.tAcc.value=g[D].texture,_.uniforms.tGlow.value=c,R(_,null)}function j(){e.setRenderTarget(b),e.render(t,i),_.uniforms.tAcc.value=b.texture,_.uniforms.tGlow.value=P,R(_,null)}function k(c){let f=new Map;t.traverse(m=>{if(m.isMesh&&m.visible)for(let N of $(m))f.set(N,N.colorWrite)}),f.forEach((m,N)=>{N.colorWrite=!1}),e.autoClear=!1,e.setRenderTarget(null),e.clearDepth(),e.render(t,i),f.forEach((m,N)=>{N.colorWrite=m}),c();let p=i.layers.mask;i.layers.set(n.overlayLayer),e.render(t,i),i.layers.mask=p,e.autoClear=!0}function W(c){let f=e.getDrawingBufferSize(new v.Vector2);(f.x!==C||f.y!==A)&&X(f.x,f.y),c&&(O=0,y&&(y=!1,n.staleShadow()));let p=n.overlaysShown(),m=n.hideOverlays(),N=e.autoClear;n.petLinear.value=1,c?j():(se(O++),ne()),n.petLinear.value=0,p?k(m):m(),e.autoClear=N,window.__studio={n:O,N:d,done:!c&&O>=d,sampleMs:U,W:C,H:A,low:r,half:l!==v.FloatType}}return{frame:W,pending:()=>O<Math.min(d,window.__studioCap||d),release:()=>{X(1,1),C=0,A=0,y=!1,n.staleShadow(),window.__studio={n:0,N:d,done:!1,off:!0}}}}window.__bsRender={create:ht};})();
