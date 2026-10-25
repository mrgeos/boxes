// Box Studio 3D: студийный рендер (собран из src/render командой npm run build; three.js — из редактора)
(()=>{var Je=Object.create;var je=Object.defineProperty;var et=Object.getOwnPropertyDescriptor;var tt=Object.getOwnPropertyNames;var it=Object.getPrototypeOf,at=Object.prototype.hasOwnProperty;var ot=(l,e)=>()=>(e||l((e={exports:{}}).exports,e),e.exports);var rt=(l,e,t,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let a of tt(e))!at.call(l,a)&&a!==t&&je(l,a,{get:()=>e[a],enumerable:!(i=et(e,a))||i.enumerable});return l};var ue=(l,e,t)=>(t=l!=null?Je(it(l)):{},rt(e||!l||!l.__esModule?je(t,"default",{value:l,enumerable:!0}):t,l));var se=ot((dt,ke)=>{ke.exports=window.__BS_THREE});var v=ue(se(),1);var n=ue(se(),1);var te=ue(se(),1),fe=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}},st=new te.OrthographicCamera(-1,1,1,-1,0,1),Be=class extends te.BufferGeometry{constructor(){super(),this.setAttribute("position",new te.Float32BufferAttribute([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new te.Float32BufferAttribute([0,2,0,0,2,0],2))}},nt=new Be,ne=class{constructor(e){this._mesh=new te.Mesh(nt,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,st)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}};var G=ue(se(),1),Ce={name:"GTAOShader",defines:{PERSPECTIVE_CAMERA:1,SAMPLES:16,NORMAL_VECTOR_TYPE:1,DEPTH_SWIZZLING:"x",SCREEN_SPACE_RADIUS:0,SCREEN_SPACE_RADIUS_SCALE:100,SCENE_CLIP_BOX:0},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new G.Vector2},cameraNear:{value:null},cameraFar:{value:null},cameraProjectionMatrix:{value:new G.Matrix4},cameraProjectionMatrixInverse:{value:new G.Matrix4},cameraWorldMatrix:{value:new G.Matrix4},radius:{value:.25},distanceExponent:{value:1},thickness:{value:1},distanceFallOff:{value:1},scale:{value:1},sceneBoxMin:{value:new G.Vector3(-1,-1,-1)},sceneBoxMax:{value:new G.Vector3(1,1,1)}},vertexShader:`

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
		}`},Ue={name:"GTAODepthShader",defines:{PERSPECTIVE_CAMERA:1},uniforms:{tDepth:{value:null},cameraNear:{value:null},cameraFar:{value:null}},vertexShader:`
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

		}`},Fe={name:"GTAOBlendShader",uniforms:{tDiffuse:{value:null},intensity:{value:1}},vertexShader:`
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
		}`};function We(l=5){let e=Math.floor(l)%2===0?Math.floor(l)+1:Math.floor(l),t=lt(e),i=t.length,a=new Uint8Array(i*4);for(let s=0;s<i;++s){let c=t[s],m=2*Math.PI*c/i,h=new G.Vector3(Math.cos(m),Math.sin(m),0).normalize();a[s*4]=(h.x*.5+.5)*255,a[s*4+1]=(h.y*.5+.5)*255,a[s*4+2]=127,a[s*4+3]=255}let r=new G.DataTexture(a,e,e);return r.wrapS=G.RepeatWrapping,r.wrapT=G.RepeatWrapping,r.needsUpdate=!0,r}function lt(l){let e=Math.floor(l)%2===0?Math.floor(l)+1:Math.floor(l),t=e*e,i=Array(t).fill(0),a=Math.floor(e/2),r=e-1;for(let s=1;s<=t;){if(a===-1&&r===e?(r=e-2,a=0):(r===e&&(r=0),a<0&&(a=e-1)),i[a*e+r]!==0){r-=2,a++;continue}else i[a*e+r]=s++;r++,a--}return i}var de=ue(se(),1),Re={name:"PoissonDenoiseShader",defines:{SAMPLES:16,SAMPLE_VECTORS:Ge(16,2,1),NORMAL_VECTOR_TYPE:1,DEPTH_VALUE_SOURCE:0},uniforms:{tDiffuse:{value:null},tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new de.Vector2},cameraProjectionMatrixInverse:{value:new de.Matrix4},lumaPhi:{value:5},depthPhi:{value:5},normalPhi:{value:5},radius:{value:4},index:{value:0}},vertexShader:`

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
		}`};function Ge(l,e,t){let i=ct(l,e,t),a="vec3[SAMPLES](";for(let r=0;r<l;r++){let s=i[r];a+=`vec3(${s.x}, ${s.y}, ${s.z})${r<l-1?",":")"}`}return a}function ct(l,e,t){let i=[];for(let a=0;a<l;a++){let r=2*Math.PI*e*a/l,s=Math.pow(a/(l-1),t);i.push(new de.Vector3(Math.cos(r),Math.sin(r),s))}return i}var me={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

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


		}`};var ze=class{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let t=0;t<256;t++)this.p[t]=Math.floor(e.random()*256);this.perm=[];for(let t=0;t<512;t++)this.perm[t]=this.p[t&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}dot(e,t,i){return e[0]*t+e[1]*i}dot3(e,t,i,a){return e[0]*t+e[1]*i+e[2]*a}dot4(e,t,i,a,r){return e[0]*t+e[1]*i+e[2]*a+e[3]*r}noise(e,t){let i,a,r,s=.5*(Math.sqrt(3)-1),c=(e+t)*s,m=Math.floor(e+c),h=Math.floor(t+c),D=(3-Math.sqrt(3))/6,b=(m+h)*D,I=m-b,M=h-b,R=e-I,E=t-M,_,F;R>E?(_=1,F=0):(_=0,F=1);let A=R-_+D,N=E-F+D,y=R-1+2*D,H=E-1+2*D,L=m&255,V=h&255,w=this.perm[L+this.perm[V]]%12,P=this.perm[L+_+this.perm[V+F]]%12,T=this.perm[L+1+this.perm[V+1]]%12,C=.5-R*R-E*E;C<0?i=0:(C*=C,i=C*C*this.dot(this.grad3[w],R,E));let S=.5-A*A-N*N;S<0?a=0:(S*=S,a=S*S*this.dot(this.grad3[P],A,N));let B=.5-y*y-H*H;return B<0?r=0:(B*=B,r=B*B*this.dot(this.grad3[T],y,H)),70*(i+a+r)}noise3d(e,t,i){let a,r,s,c,h=(e+t+i)*.3333333333333333,D=Math.floor(e+h),b=Math.floor(t+h),I=Math.floor(i+h),M=1/6,R=(D+b+I)*M,E=D-R,_=b-R,F=I-R,A=e-E,N=t-_,y=i-F,H,L,V,w,P,T;A>=N?N>=y?(H=1,L=0,V=0,w=1,P=1,T=0):A>=y?(H=1,L=0,V=0,w=1,P=0,T=1):(H=0,L=0,V=1,w=1,P=0,T=1):N<y?(H=0,L=0,V=1,w=0,P=1,T=1):A<y?(H=0,L=1,V=0,w=0,P=1,T=1):(H=0,L=1,V=0,w=1,P=1,T=0);let C=A-H+M,S=N-L+M,B=y-V+M,$=A-w+2*M,j=N-P+2*M,ae=y-T+2*M,oe=A-1+3*M,K=N-1+3*M,z=y-1+3*M,J=D&255,ee=b&255,q=I&255,W=this.perm[J+this.perm[ee+this.perm[q]]]%12,re=this.perm[J+H+this.perm[ee+L+this.perm[q+V]]]%12,le=this.perm[J+w+this.perm[ee+P+this.perm[q+T]]]%12,he=this.perm[J+1+this.perm[ee+1+this.perm[q+1]]]%12,Q=.6-A*A-N*N-y*y;Q<0?a=0:(Q*=Q,a=Q*Q*this.dot3(this.grad3[W],A,N,y));let X=.6-C*C-S*S-B*B;X<0?r=0:(X*=X,r=X*X*this.dot3(this.grad3[re],C,S,B));let Z=.6-$*$-j*j-ae*ae;Z<0?s=0:(Z*=Z,s=Z*Z*this.dot3(this.grad3[le],$,j,ae));let Y=.6-oe*oe-K*K-z*z;return Y<0?c=0:(Y*=Y,c=Y*Y*this.dot3(this.grad3[he],oe,K,z)),32*(a+r+s+c)}noise4d(e,t,i,a){let r=this.grad4,s=this.simplex,c=this.perm,m=(Math.sqrt(5)-1)/4,h=(5-Math.sqrt(5))/20,D,b,I,M,R,E=(e+t+i+a)*m,_=Math.floor(e+E),F=Math.floor(t+E),A=Math.floor(i+E),N=Math.floor(a+E),y=(_+F+A+N)*h,H=_-y,L=F-y,V=A-y,w=N-y,P=e-H,T=t-L,C=i-V,S=a-w,B=P>T?32:0,$=P>C?16:0,j=T>C?8:0,ae=P>S?4:0,oe=T>S?2:0,K=C>S?1:0,z=B+$+j+ae+oe+K,J=s[z][0]>=3?1:0,ee=s[z][1]>=3?1:0,q=s[z][2]>=3?1:0,W=s[z][3]>=3?1:0,re=s[z][0]>=2?1:0,le=s[z][1]>=2?1:0,he=s[z][2]>=2?1:0,Q=s[z][3]>=2?1:0,X=s[z][0]>=1?1:0,Z=s[z][1]>=1?1:0,Y=s[z][2]>=1?1:0,Ne=s[z][3]>=1?1:0,ge=P-J+h,xe=T-ee+h,_e=C-q+h,Ae=S-W+h,Ve=P-re+2*h,u=T-le+2*h,o=C-he+2*h,f=S-Q+2*h,p=P-X+3*h,U=T-Z+3*h,x=C-Y+3*h,k=S-Ne+3*h,O=P-1+4*h,g=T-1+4*h,ce=C-1+4*h,Le=S-1+4*h,Me=_&255,Te=F&255,Se=A&255,we=N&255,Qe=c[Me+c[Te+c[Se+c[we]]]]%32,Xe=c[Me+J+c[Te+ee+c[Se+q+c[we+W]]]]%32,Ye=c[Me+re+c[Te+le+c[Se+he+c[we+Q]]]]%32,$e=c[Me+X+c[Te+Z+c[Se+Y+c[we+Ne]]]]%32,Ke=c[Me+1+c[Te+1+c[Se+1+c[we+1]]]]%32,be=.6-P*P-T*T-C*C-S*S;be<0?D=0:(be*=be,D=be*be*this.dot4(r[Qe],P,T,C,S));let ye=.6-ge*ge-xe*xe-_e*_e-Ae*Ae;ye<0?b=0:(ye*=ye,b=ye*ye*this.dot4(r[Xe],ge,xe,_e,Ae));let Pe=.6-Ve*Ve-u*u-o*o-f*f;Pe<0?I=0:(Pe*=Pe,I=Pe*Pe*this.dot4(r[Ye],Ve,u,o,f));let De=.6-p*p-U*U-x*x-k*k;De<0?M=0:(De*=De,M=De*De*this.dot4(r[$e],p,U,x,k));let Ee=.6-O*O-g*g-ce*ce-Le*Le;return Ee<0?R=0:(Ee*=Ee,R=Ee*Ee*this.dot4(r[Ke],O,g,ce,Le)),27*(D+b+I+M+R)}};var ve=class l extends fe{constructor(e,t,i,a,r,s,c){super(),this.width=i!==void 0?i:512,this.height=a!==void 0?a:512,this.clear=!0,this.camera=t,this.scene=e,this.output=0,this._renderGBuffer=!0,this._visibilityCache=new Map,this.blendIntensity=1,this.pdRings=2,this.pdRadiusExponent=2,this.pdSamples=16,this.gtaoNoiseTexture=We(),this.pdNoiseTexture=this.generateNoise(),this.gtaoRenderTarget=new n.WebGLRenderTarget(this.width,this.height,{type:n.HalfFloatType}),this.pdRenderTarget=this.gtaoRenderTarget.clone(),this.gtaoMaterial=new n.ShaderMaterial({defines:Object.assign({},Ce.defines),uniforms:n.UniformsUtils.clone(Ce.uniforms),vertexShader:Ce.vertexShader,fragmentShader:Ce.fragmentShader,blending:n.NoBlending,depthTest:!1,depthWrite:!1}),this.gtaoMaterial.defines.PERSPECTIVE_CAMERA=this.camera.isPerspectiveCamera?1:0,this.gtaoMaterial.uniforms.tNoise.value=this.gtaoNoiseTexture,this.gtaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.normalMaterial=new n.MeshNormalMaterial,this.normalMaterial.blending=n.NoBlending,this.pdMaterial=new n.ShaderMaterial({defines:Object.assign({},Re.defines),uniforms:n.UniformsUtils.clone(Re.uniforms),vertexShader:Re.vertexShader,fragmentShader:Re.fragmentShader,depthTest:!1,depthWrite:!1}),this.pdMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.pdMaterial.uniforms.tNoise.value=this.pdNoiseTexture,this.pdMaterial.uniforms.resolution.value.set(this.width,this.height),this.pdMaterial.uniforms.lumaPhi.value=10,this.pdMaterial.uniforms.depthPhi.value=2,this.pdMaterial.uniforms.normalPhi.value=3,this.pdMaterial.uniforms.radius.value=8,this.depthRenderMaterial=new n.ShaderMaterial({defines:Object.assign({},Ue.defines),uniforms:n.UniformsUtils.clone(Ue.uniforms),vertexShader:Ue.vertexShader,fragmentShader:Ue.fragmentShader,blending:n.NoBlending}),this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new n.ShaderMaterial({uniforms:n.UniformsUtils.clone(me.uniforms),vertexShader:me.vertexShader,fragmentShader:me.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:n.DstColorFactor,blendDst:n.ZeroFactor,blendEquation:n.AddEquation,blendSrcAlpha:n.DstAlphaFactor,blendDstAlpha:n.ZeroFactor,blendEquationAlpha:n.AddEquation}),this.blendMaterial=new n.ShaderMaterial({uniforms:n.UniformsUtils.clone(Fe.uniforms),vertexShader:Fe.vertexShader,fragmentShader:Fe.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blending:n.CustomBlending,blendSrc:n.DstColorFactor,blendDst:n.ZeroFactor,blendEquation:n.AddEquation,blendSrcAlpha:n.DstAlphaFactor,blendDstAlpha:n.ZeroFactor,blendEquationAlpha:n.AddEquation}),this.fsQuad=new ne(null),this.originalClearColor=new n.Color,this.setGBuffer(r?r.depthTexture:void 0,r?r.normalTexture:void 0),s!==void 0&&this.updateGtaoMaterial(s),c!==void 0&&this.updatePdMaterial(c)}dispose(){this.gtaoNoiseTexture.dispose(),this.pdNoiseTexture.dispose(),this.normalRenderTarget.dispose(),this.gtaoRenderTarget.dispose(),this.pdRenderTarget.dispose(),this.normalMaterial.dispose(),this.pdMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this.fsQuad.dispose()}get gtaoMap(){return this.pdRenderTarget.texture}setGBuffer(e,t){e!==void 0?(this.depthTexture=e,this.normalTexture=t,this._renderGBuffer=!1):(this.depthTexture=new n.DepthTexture,this.depthTexture.format=n.DepthStencilFormat,this.depthTexture.type=n.UnsignedInt248Type,this.normalRenderTarget=new n.WebGLRenderTarget(this.width,this.height,{minFilter:n.NearestFilter,magFilter:n.NearestFilter,type:n.HalfFloatType,depthTexture:this.depthTexture}),this.normalTexture=this.normalRenderTarget.texture,this._renderGBuffer=!0);let i=this.normalTexture?1:0,a=this.depthTexture===this.normalTexture?"w":"x";this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE=i,this.gtaoMaterial.defines.DEPTH_SWIZZLING=a,this.gtaoMaterial.uniforms.tNormal.value=this.normalTexture,this.gtaoMaterial.uniforms.tDepth.value=this.depthTexture,this.pdMaterial.defines.NORMAL_VECTOR_TYPE=i,this.pdMaterial.defines.DEPTH_SWIZZLING=a,this.pdMaterial.uniforms.tNormal.value=this.normalTexture,this.pdMaterial.uniforms.tDepth.value=this.depthTexture,this.depthRenderMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture}setSceneClipBox(e){e?(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX!==1,this.gtaoMaterial.defines.SCENE_CLIP_BOX=1,this.gtaoMaterial.uniforms.sceneBoxMin.value.copy(e.min),this.gtaoMaterial.uniforms.sceneBoxMax.value.copy(e.max)):(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX===0,this.gtaoMaterial.defines.SCENE_CLIP_BOX=0)}updateGtaoMaterial(e){e.radius!==void 0&&(this.gtaoMaterial.uniforms.radius.value=e.radius),e.distanceExponent!==void 0&&(this.gtaoMaterial.uniforms.distanceExponent.value=e.distanceExponent),e.thickness!==void 0&&(this.gtaoMaterial.uniforms.thickness.value=e.thickness),e.distanceFallOff!==void 0&&(this.gtaoMaterial.uniforms.distanceFallOff.value=e.distanceFallOff,this.gtaoMaterial.needsUpdate=!0),e.scale!==void 0&&(this.gtaoMaterial.uniforms.scale.value=e.scale),e.samples!==void 0&&e.samples!==this.gtaoMaterial.defines.SAMPLES&&(this.gtaoMaterial.defines.SAMPLES=e.samples,this.gtaoMaterial.needsUpdate=!0),e.screenSpaceRadius!==void 0&&(e.screenSpaceRadius?1:0)!==this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS&&(this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS=e.screenSpaceRadius?1:0,this.gtaoMaterial.needsUpdate=!0)}updatePdMaterial(e){let t=!1;e.lumaPhi!==void 0&&(this.pdMaterial.uniforms.lumaPhi.value=e.lumaPhi),e.depthPhi!==void 0&&(this.pdMaterial.uniforms.depthPhi.value=e.depthPhi),e.normalPhi!==void 0&&(this.pdMaterial.uniforms.normalPhi.value=e.normalPhi),e.radius!==void 0&&e.radius!==this.radius&&(this.pdMaterial.uniforms.radius.value=e.radius),e.radiusExponent!==void 0&&e.radiusExponent!==this.pdRadiusExponent&&(this.pdRadiusExponent=e.radiusExponent,t=!0),e.rings!==void 0&&e.rings!==this.pdRings&&(this.pdRings=e.rings,t=!0),e.samples!==void 0&&e.samples!==this.pdSamples&&(this.pdSamples=e.samples,t=!0),t&&(this.pdMaterial.defines.SAMPLES=this.pdSamples,this.pdMaterial.defines.SAMPLE_VECTORS=Ge(this.pdSamples,this.pdRings,this.pdRadiusExponent),this.pdMaterial.needsUpdate=!0)}render(e,t,i){switch(this._renderGBuffer&&(this.overrideVisibility(),this.renderOverride(e,this.normalMaterial,this.normalRenderTarget,7829503,1),this.restoreVisibility()),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy(this.camera.matrixWorld),this.renderPass(e,this.gtaoMaterial,this.gtaoRenderTarget,16777215,1),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.renderPass(e,this.pdMaterial,this.pdRenderTarget,16777215,1),this.output){case l.OUTPUT.Off:break;case l.OUTPUT.Diffuse:this.copyMaterial.uniforms.tDiffuse.value=i.texture,this.copyMaterial.blending=n.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case l.OUTPUT.AO:this.copyMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.copyMaterial.blending=n.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case l.OUTPUT.Denoise:this.copyMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.copyMaterial.blending=n.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case l.OUTPUT.Depth:this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.renderPass(e,this.depthRenderMaterial,this.renderToScreen?null:t);break;case l.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalRenderTarget.texture,this.copyMaterial.blending=n.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case l.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=i.texture,this.copyMaterial.blending=n.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t),this.blendMaterial.uniforms.intensity.value=this.blendIntensity,this.blendMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.renderPass(e,this.blendMaterial,this.renderToScreen?null:t);break;default:console.warn("THREE.GTAOPass: Unknown output type.")}}renderPass(e,t,i,a,r){e.getClearColor(this.originalClearColor);let s=e.getClearAlpha(),c=e.autoClear;e.setRenderTarget(i),e.autoClear=!1,a!=null&&(e.setClearColor(a),e.setClearAlpha(r||0),e.clear()),this.fsQuad.material=t,this.fsQuad.render(e),e.autoClear=c,e.setClearColor(this.originalClearColor),e.setClearAlpha(s)}renderOverride(e,t,i,a,r){e.getClearColor(this.originalClearColor);let s=e.getClearAlpha(),c=e.autoClear;e.setRenderTarget(i),e.autoClear=!1,a=t.clearColor||a,r=t.clearAlpha||r,a!=null&&(e.setClearColor(a),e.setClearAlpha(r||0),e.clear()),this.scene.overrideMaterial=t,e.render(this.scene,this.camera),this.scene.overrideMaterial=null,e.autoClear=c,e.setClearColor(this.originalClearColor),e.setClearAlpha(s)}setSize(e,t){this.width=e,this.height=t,this.gtaoRenderTarget.setSize(e,t),this.normalRenderTarget.setSize(e,t),this.pdRenderTarget.setSize(e,t),this.gtaoMaterial.uniforms.resolution.value.set(e,t),this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.pdMaterial.uniforms.resolution.value.set(e,t),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)}overrideVisibility(){let e=this.scene,t=this._visibilityCache;e.traverse(function(i){t.set(i,i.visible),(i.isPoints||i.isLine)&&(i.visible=!1)})}restoreVisibility(){let e=this.scene,t=this._visibilityCache;e.traverse(function(i){let a=t.get(i);i.visible=a}),t.clear()}generateNoise(e=64){let t=new ze,i=e*e*4,a=new Uint8Array(i);for(let s=0;s<e;s++)for(let c=0;c<e;c++){let m=s,h=c;a[(s*e+c)*4]=(t.noise(m,h)*.5+.5)*255,a[(s*e+c)*4+1]=(t.noise(m+e,h)*.5+.5)*255,a[(s*e+c)*4+2]=(t.noise(m,h+e)*.5+.5)*255,a[(s*e+c)*4+3]=(t.noise(m+e,h+e)*.5+.5)*255}let r=new n.DataTexture(a,e,e,n.RGBAFormat,n.UnsignedByteType);return r.wrapS=n.RepeatWrapping,r.wrapT=n.RepeatWrapping,r.needsUpdate=!0,r}};ve.OUTPUT={Off:-1,Default:0,Diffuse:1,Depth:2,Normal:3,AO:4,Denoise:5};var d=ue(se(),1);var Ze=ue(se(),1),qe={name:"LuminosityHighPassShader",shaderID:"luminosityHighPass",uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new Ze.Color(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`};var pe=class l extends fe{constructor(e,t,i,a){super(),this.strength=t!==void 0?t:1,this.radius=i,this.threshold=a,this.resolution=e!==void 0?new d.Vector2(e.x,e.y):new d.Vector2(256,256),this.clearColor=new d.Color(0,0,0),this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let r=Math.round(this.resolution.x/2),s=Math.round(this.resolution.y/2);this.renderTargetBright=new d.WebGLRenderTarget(r,s,{type:d.HalfFloatType}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let b=0;b<this.nMips;b++){let I=new d.WebGLRenderTarget(r,s,{type:d.HalfFloatType});I.texture.name="UnrealBloomPass.h"+b,I.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(I);let M=new d.WebGLRenderTarget(r,s,{type:d.HalfFloatType});M.texture.name="UnrealBloomPass.v"+b,M.texture.generateMipmaps=!1,this.renderTargetsVertical.push(M),r=Math.round(r/2),s=Math.round(s/2)}let c=qe;this.highPassUniforms=d.UniformsUtils.clone(c.uniforms),this.highPassUniforms.luminosityThreshold.value=a,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new d.ShaderMaterial({uniforms:this.highPassUniforms,vertexShader:c.vertexShader,fragmentShader:c.fragmentShader}),this.separableBlurMaterials=[];let m=[3,5,7,9,11];r=Math.round(this.resolution.x/2),s=Math.round(this.resolution.y/2);for(let b=0;b<this.nMips;b++)this.separableBlurMaterials.push(this.getSeperableBlurMaterial(m[b])),this.separableBlurMaterials[b].uniforms.invSize.value=new d.Vector2(1/r,1/s),r=Math.round(r/2),s=Math.round(s/2);this.compositeMaterial=this.getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let h=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=h,this.bloomTintColors=[new d.Vector3(1,1,1),new d.Vector3(1,1,1),new d.Vector3(1,1,1),new d.Vector3(1,1,1),new d.Vector3(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;let D=me;this.copyUniforms=d.UniformsUtils.clone(D.uniforms),this.blendMaterial=new d.ShaderMaterial({uniforms:this.copyUniforms,vertexShader:D.vertexShader,fragmentShader:D.fragmentShader,blending:d.AdditiveBlending,depthTest:!1,depthWrite:!1,transparent:!0}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new d.Color,this.oldClearAlpha=1,this.basic=new d.MeshBasicMaterial,this.fsQuad=new ne(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this.basic.dispose(),this.fsQuad.dispose()}setSize(e,t){let i=Math.round(e/2),a=Math.round(t/2);this.renderTargetBright.setSize(i,a);for(let r=0;r<this.nMips;r++)this.renderTargetsHorizontal[r].setSize(i,a),this.renderTargetsVertical[r].setSize(i,a),this.separableBlurMaterials[r].uniforms.invSize.value=new d.Vector2(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2)}render(e,t,i,a,r){e.getClearColor(this._oldClearColor),this.oldClearAlpha=e.getClearAlpha();let s=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),r&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this.fsQuad.material=this.basic,this.basic.map=i.texture,e.setRenderTarget(null),e.clear(),this.fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=i.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this.fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this.fsQuad.render(e);let c=this.renderTargetBright;for(let m=0;m<this.nMips;m++)this.fsQuad.material=this.separableBlurMaterials[m],this.separableBlurMaterials[m].uniforms.colorTexture.value=c.texture,this.separableBlurMaterials[m].uniforms.direction.value=l.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[m]),e.clear(),this.fsQuad.render(e),this.separableBlurMaterials[m].uniforms.colorTexture.value=this.renderTargetsHorizontal[m].texture,this.separableBlurMaterials[m].uniforms.direction.value=l.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[m]),e.clear(),this.fsQuad.render(e),c=this.renderTargetsVertical[m];this.fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,r&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(i),this.fsQuad.render(e)),e.setClearColor(this._oldClearColor,this.oldClearAlpha),e.autoClear=s}getSeperableBlurMaterial(e){let t=[];for(let i=0;i<e;i++)t.push(.39894*Math.exp(-.5*i*i/(e*e))/e);return new d.ShaderMaterial({defines:{KERNEL_RADIUS:e},uniforms:{colorTexture:{value:null},invSize:{value:new d.Vector2(.5,.5)},direction:{value:new d.Vector2(.5,.5)},gaussianCoefficients:{value:t}},vertexShader:`varying vec2 vUv;
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
				}`})}getCompositeMaterial(e){return new d.ShaderMaterial({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`varying vec2 vUv;
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
				}`})}};pe.BlurDirectionX=new d.Vector2(1,0);pe.BlurDirectionY=new d.Vector2(0,1);var ie={ao:.6,bloom:.3,vig:0,vigExport:.3,grain:.12,contrast:0,keyR:.07},Oe=(l,e)=>{let t=1,i=0;for(;l>0;)t/=e,i+=t*(l%e),l=Math.floor(l/e);return i},Ie="bool bad(vec3 v){ return !(abs(v.x) < 1e5 && abs(v.y) < 1e5 && abs(v.z) < 1e5); }   // true for NaN and Inf too",ut="varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",He=(l,e)=>new v.ShaderMaterial({vertexShader:ut,fragmentShader:l,uniforms:e,depthTest:!1,depthWrite:!1,blending:v.NoBlending});function ht(l){let{renderer:e,scene:t,camera:i,key:a,viewport:r}=l,s=l.low,c=!window.__forceHalf&&e.extensions.has("EXT_color_buffer_float")?v.FloatType:v.HalfFloatType,m=+new URLSearchParams(location.search).get("n")||Math.min(s?16:64,c===v.FloatType?64:24),h=(u,o={})=>new v.WebGLRenderTarget(1,1,{type:u,depthBuffer:!1,...o}),D=h(v.HalfFloatType,{samples:s?0:4,depthBuffer:!0}),b=h(v.HalfFloatType),I=h(v.HalfFloatType),M=[0,1].map(()=>h(c,{minFilter:v.NearestFilter,magFilter:v.NearestFilter})),R=0,E=1,_=1,F=0,A=0,N=!1,y="",H=0,L=new ne(null),V=(u,o)=>{L.material=u,e.setRenderTarget(o),L.render(e)},w=new ve(t,i,1,1);w.output=ve.OUTPUT.Off,w.normalMaterial.side=v.DoubleSide,w.updatePdMaterial({radius:6});let P=(u,o,f)=>{u.fragmentShader.includes(o)||console.warn("GTAO noise patch missed"),u.fragmentShader=u.fragmentShader.replace("uniform sampler2D tNoise;","uniform sampler2D tNoise; uniform float uFrame;").split(o).join(o+f),u.uniforms.uFrame={value:0},u.needsUpdate=!0};P(w.gtaoMaterial,"vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);","vec2 nd = noiseTexel.xy * 2.0 - 1.0; float na = atan(nd.y, nd.x) + uFrame * 2.399963; noiseTexel.xy = vec2(cos(na), sin(na)) * 0.5 + 0.5; noiseTexel.w = fract(noiseTexel.w + uFrame * 0.7548777);"),P(w.pdMaterial,"vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);","noiseTexel = fract(noiseTexel + uFrame * 0.618034);");let T=new pe(new v.Vector2(1,1),ie.bloom,.7,6);T.highPassUniforms.smoothWidth.value=.6;let C=He(`uniform sampler2D tScene, tAO, tNormal; uniform float uAO, uInject, uGuard; uniform mat4 uCam; varying vec2 vUv;
${Ie}
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
}`,{uInject:{value:0},uGuard:{value:1},tScene:{value:null},tAO:{value:null},tNormal:{value:null},uAO:{value:ie.ao*2},uCam:{value:new v.Matrix4}}),S=He(`uniform sampler2D tPrev, tNew; uniform float uW, uGuard; varying vec2 vUv;
${Ie}
void main(){
  vec4 p = texture2D(tPrev, vUv), n = texture2D(tNew, vUv);
  if (uGuard > .5) {
    bool nb = n.a < 0. || bad(n.rgb) || !(n.a == n.a), pb = bad(p.rgb) || !(p.a == p.a);
    if (nb && pb) { gl_FragColor = vec4(0.); return; }
    if (nb) { gl_FragColor = uW >= 1. ? vec4(0.) : p; return; }   // a bad new texel: keep the average as it was
    if (pb) { gl_FragColor = n; return; }
  }
  gl_FragColor = mix(p, n, uW);
}`,{uGuard:{value:1},tPrev:{value:null},tNew:{value:null},uW:{value:1}}),B=He(`uniform sampler2D tMap; uniform float uGuard; varying vec2 vUv;
${Ie}
void main(){ vec4 t = texture2D(tMap, vUv); if (uGuard > .5) t = (bad(t.rgb) || !(t.a == t.a)) ? vec4(0.) : vec4(clamp(t.rgb, 0., 64.), clamp(t.a, 0., 1.)); gl_FragColor = t; }   // keeps one hot texel from flooding the bloom mips
`,{uGuard:{value:1},tMap:{value:null}}),$=new v.DataTexture(new Uint8Array([0,0,0,0]),1,1);$.needsUpdate=!0;let j=He(`precision highp float;
uniform sampler2D tAcc, tGlow; uniform float uVig, uGrain, uCon; varying vec2 vUv;
#include <tonemapping_pars_fragment>
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
${Ie}
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
}`,{tAcc:{value:null},tGlow:{value:null},uVig:{value:ie.vig},uGrain:{value:ie.grain},uCon:{value:ie.contrast}});j.toneMapped=!1;function ae(u,o){E=u,_=o,F=0;let f=s?.5:1;for(let p of[D,b,I,...M])p.setSize(E,_);w.setSize(Math.round(E*f),Math.round(_*f)),w.updateGtaoMaterial({samples:s?12:24,radius:.14,thickness:.35,distanceExponent:1}),T.setSize(E,_)}function oe(u){let o=[];return t.traverse(f=>{f.isMesh&&f.visible&&u(f)&&(f.visible=!1,o.push(f))}),()=>o.forEach(f=>{f.visible=!0})}let K=u=>[u.material].flat().filter(Boolean),z=u=>K(u).some(o=>o.transparent&&(!o.depthWrite||o.opacity<.98)||o.alphaTest>.4),J=u=>u.material===l.contactMat;function ee(u){let o=r.clientWidth,f=r.clientHeight,p=e.getPixelRatio(),U=i.view?.enabled?i.view:null;i.setViewOffset(o,f,(U?U.offsetX:0)+(Oe(u+1,2)-.5)/p,(U?U.offsetY:0)+(Oe(u+1,3)-.5)/p,o,f)}let q=new v.Vector3,W=new v.Vector3,re=new v.Vector3,le=new v.Vector3;function he(u){q.copy(a.position),W.copy(q).sub(a.target.position);let o=W.length();W.normalize(),re.crossVectors(W,Math.abs(W.y)>.95?new v.Vector3(1,0,0):new v.Vector3(0,1,0)).normalize(),le.crossVectors(W,re);let f=o*(s?ie.keyR*.65:ie.keyR)*Math.sqrt(Oe(u+1,5)),p=2*Math.PI*Oe(u+1,7);a.position.addScaledVector(re,f*Math.cos(p)).addScaledVector(le,f*Math.sin(p))}function Q(){let u=2166136261,o=x=>{u=Math.imul(u^(Math.round(x*1e5)|0),16777619)},f=x=>{for(let k=0;k<x.length;k++)o(x[k])};f(i.matrixWorld.elements),f(i.projectionMatrix.elements),o(E),o(_),o(e.toneMappingExposure),o(t.environmentIntensity),o(t.environment?t.environment.id:-1),o(t.environmentRotation.y);let p=["map","bumpMap","roughnessMap","metalnessMap","normalMap","clearcoatMap","iridescenceMap"],U=(x,k)=>{if(!x.layers.isEnabled(l.overlayLayer)&&(o(x.visible?1:0),!!x.visible)){if(f(x.position.toArray()),f(x.quaternion.toArray()),f(x.scale.toArray()),x.matrixAutoUpdate||f(x.matrix.elements),x.isLight&&(o(x.intensity),o(x.color.r),o(x.color.g),o(x.color.b)),x.isMesh){let O=x.geometry;o(O.id),o(O.attributes.position?.version||0),o(O.index?.version||0),o(O.drawRange.count===1/0?0:O.drawRange.count);for(let g of K(x)){o(g.id),o(g.visible?1:0),o(g.opacity),o(g.side),o(g.transparent?1:0),o(g.alphaTest),o(g.depthWrite?1:0),o(g.clearcoat||0),o(g.clearcoatRoughness||0),o(g.sheen||0),o(g.iridescence||0),o(g.bumpScale||0),o(g.envMapIntensity??1),g.color&&(o(g.color.r),o(g.color.g),o(g.color.b)),g.emissive&&(o(g.emissive.r),o(g.emissive.g),o(g.emissive.b)),o(g.roughness??0),o(g.metalness??0),o(g.envMap?g.envMap.id:-1);for(let ce of p)g[ce]&&(o(g[ce].id),o(g[ce].version))}}if(!k)for(let O of x.children)U(O)}};return U(t),u}function X(u){let o=performance.now(),f=a.position.clone(),p=i.view?.enabled?{...i.view}:null,U=a.shadow.radius;u&&(ee(u),he(u),a.shadow.radius=Math.max(1,U*.5)),e.shadowMap.needsUpdate=!0,N=!0;let x=oe(J);e.setRenderTarget(D),e.render(t,i),w.gtaoMaterial.uniforms.uFrame.value=w.pdMaterial.uniforms.uFrame.value=u;let k=window.__noAOHide?()=>{}:oe(z);w.render(e,null,null),k(),x();let O=C.uniforms;O.tScene.value=D.texture,O.tAO.value=w.gtaoMap,O.tNormal.value=w.normalRenderTarget.texture;let g=window.__noGuard?0:1;O.uGuard.value=S.uniforms.uGuard.value=B.uniforms.uGuard.value=g,O.uInject.value=window.__inject===u?1:0,O.uCam.value.copy(i.matrixWorld),V(C,b),S.uniforms.tPrev.value=M[R].texture,S.uniforms.tNew.value=b.texture,S.uniforms.uW.value=1/(u+1),V(S,M[1-R]),R=1-R,p?i.setViewOffset(p.fullWidth,p.fullHeight,p.offsetX,p.offsetY,p.width,p.height):i.clearViewOffset(),a.position.copy(f),a.shadow.radius=U,window.__studioSync&&e.readRenderTargetPixels(M[R],0,0,1,1,new Float32Array(4)),A=performance.now()-o}function Z(){let u=$;ie.bloom>0&&(B.uniforms.tMap.value=M[R].texture,V(B,I),T.strength=ie.bloom*1.2,T.render(e,null,I,0,!1),u=T.renderTargetsHorizontal[0].texture),j.uniforms.tAcc.value=M[R].texture,j.uniforms.tGlow.value=u,V(j,null)}function Y(){e.setRenderTarget(D),e.render(t,i),j.uniforms.tAcc.value=D.texture,j.uniforms.tGlow.value=$,V(j,null)}function Ne(u){let o=new Map;t.traverse(p=>{if(p.isMesh&&p.visible)for(let U of K(p))o.set(U,U.colorWrite)}),o.forEach((p,U)=>{U.colorWrite=!1}),e.autoClear=!1,e.setRenderTarget(null),e.clearDepth(),e.render(t,i),o.forEach((p,U)=>{U.colorWrite=p}),u();let f=i.layers.mask;i.layers.set(l.overlayLayer),e.render(t,i),i.layers.mask=f,e.autoClear=!0}function ge(u){let o=e.getDrawingBufferSize(new v.Vector2);(o.x!==E||o.y!==_)&&ae(o.x,o.y);let f=u?Q():y,p=u&&F>0&&f===y;y=f,H++,u&&!p&&(F=0,N&&(N=!1,l.staleShadow()));let U=l.overlaysShown(),x=l.hideOverlays(),k=e.autoClear;l.petLinear.value=1,u?p?Z():Y():(X(F++),Z()),l.petLinear.value=0,U?Ne(x):x(),e.autoClear=k,window.__studio={n:F,N:m,done:F>=m,sampleMs:A,W:E,H:_,low:s,half:c!==v.FloatType,frames:H,mb:Math.round(xe()/1048576)}}function xe(){let u=E*_,o=c===v.FloatType?16:8,f=s?.25:1,p=s?1:4;return u*(8*p+4*p+8+8+8+2*o)+u*f*16+u*8*2*(1/3)}return{frame:ge,pending:()=>F<Math.min(m,window.__studioCap||m),release:()=>{ae(1,1),E=0,_=0,N=!1,y="",l.staleShadow(),window.__studio={n:0,N:m,done:!1,off:!0}},status:()=>({n:F,N:m})}}window.__bsRender={create:ht};})();
