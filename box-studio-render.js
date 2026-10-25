// Box Studio 3D: студийный рендер (собран из src/render командой npm run build; three.js — из редактора)
(()=>{var Je=Object.create;var je=Object.defineProperty;var et=Object.getOwnPropertyDescriptor;var tt=Object.getOwnPropertyNames;var it=Object.getPrototypeOf,at=Object.prototype.hasOwnProperty;var ot=(l,e)=>()=>(e||l((e={exports:{}}).exports,e),e.exports);var rt=(l,e,t,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let a of tt(e))!at.call(l,a)&&a!==t&&je(l,a,{get:()=>e[a],enumerable:!(i=et(e,a))||i.enumerable});return l};var he=(l,e,t)=>(t=l!=null?Je(it(l)):{},rt(e||!l||!l.__esModule?je(t,"default",{value:l,enumerable:!0}):t,l));var se=ot((dt,ke)=>{ke.exports=window.__BS_THREE});var g=he(se(),1);var n=he(se(),1);var ae=he(se(),1),me=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}},st=new ae.OrthographicCamera(-1,1,1,-1,0,1),Be=class extends ae.BufferGeometry{constructor(){super(),this.setAttribute("position",new ae.Float32BufferAttribute([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new ae.Float32BufferAttribute([0,2,0,0,2,0],2))}},nt=new Be,ne=class{constructor(e){this._mesh=new ae.Mesh(nt,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,st)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}};var j=he(se(),1),Ce={name:"GTAOShader",defines:{PERSPECTIVE_CAMERA:1,SAMPLES:16,NORMAL_VECTOR_TYPE:1,DEPTH_SWIZZLING:"x",SCREEN_SPACE_RADIUS:0,SCREEN_SPACE_RADIUS_SCALE:100,SCENE_CLIP_BOX:0},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new j.Vector2},cameraNear:{value:null},cameraFar:{value:null},cameraProjectionMatrix:{value:new j.Matrix4},cameraProjectionMatrixInverse:{value:new j.Matrix4},cameraWorldMatrix:{value:new j.Matrix4},radius:{value:.25},distanceExponent:{value:1},thickness:{value:1},distanceFallOff:{value:1},scale:{value:1},sceneBoxMin:{value:new j.Vector3(-1,-1,-1)},sceneBoxMax:{value:new j.Vector3(1,1,1)}},vertexShader:`

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

		}`},ze={name:"GTAOBlendShader",uniforms:{tDiffuse:{value:null},intensity:{value:1}},vertexShader:`
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
		}`};function We(l=5){let e=Math.floor(l)%2===0?Math.floor(l)+1:Math.floor(l),t=lt(e),i=t.length,a=new Uint8Array(i*4);for(let s=0;s<i;++s){let c=t[s],d=2*Math.PI*c/i,f=new j.Vector3(Math.cos(d),Math.sin(d),0).normalize();a[s*4]=(f.x*.5+.5)*255,a[s*4+1]=(f.y*.5+.5)*255,a[s*4+2]=127,a[s*4+3]=255}let r=new j.DataTexture(a,e,e);return r.wrapS=j.RepeatWrapping,r.wrapT=j.RepeatWrapping,r.needsUpdate=!0,r}function lt(l){let e=Math.floor(l)%2===0?Math.floor(l)+1:Math.floor(l),t=e*e,i=Array(t).fill(0),a=Math.floor(e/2),r=e-1;for(let s=1;s<=t;){if(a===-1&&r===e?(r=e-2,a=0):(r===e&&(r=0),a<0&&(a=e-1)),i[a*e+r]!==0){r-=2,a++;continue}else i[a*e+r]=s++;r++,a--}return i}var ve=he(se(),1),Re={name:"PoissonDenoiseShader",defines:{SAMPLES:16,SAMPLE_VECTORS:Ge(16,2,1),NORMAL_VECTOR_TYPE:1,DEPTH_VALUE_SOURCE:0},uniforms:{tDiffuse:{value:null},tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new ve.Vector2},cameraProjectionMatrixInverse:{value:new ve.Matrix4},lumaPhi:{value:5},depthPhi:{value:5},normalPhi:{value:5},radius:{value:4},index:{value:0}},vertexShader:`

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
		}`};function Ge(l,e,t){let i=ct(l,e,t),a="vec3[SAMPLES](";for(let r=0;r<l;r++){let s=i[r];a+=`vec3(${s.x}, ${s.y}, ${s.z})${r<l-1?",":")"}`}return a}function ct(l,e,t){let i=[];for(let a=0;a<l;a++){let r=2*Math.PI*e*a/l,s=Math.pow(a/(l-1),t);i.push(new ve.Vector3(Math.cos(r),Math.sin(r),s))}return i}var pe={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

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


		}`};var Oe=class{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let t=0;t<256;t++)this.p[t]=Math.floor(e.random()*256);this.perm=[];for(let t=0;t<512;t++)this.perm[t]=this.p[t&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}dot(e,t,i){return e[0]*t+e[1]*i}dot3(e,t,i,a){return e[0]*t+e[1]*i+e[2]*a}dot4(e,t,i,a,r){return e[0]*t+e[1]*i+e[2]*a+e[3]*r}noise(e,t){let i,a,r,s=.5*(Math.sqrt(3)-1),c=(e+t)*s,d=Math.floor(e+c),f=Math.floor(t+c),M=(3-Math.sqrt(3))/6,y=(d+f)*M,V=d-y,T=f-y,b=e-V,E=t-T,N,W;b>E?(N=1,W=0):(N=0,W=1);let _=b-N+M,R=E-W+M,A=b-1+2*M,I=E-1+2*M,F=d&255,S=f&255,L=this.perm[F+this.perm[S]]%12,w=this.perm[F+N+this.perm[S+W]]%12,C=this.perm[F+1+this.perm[S+1]]%12,P=.5-b*b-E*E;P<0?i=0:(P*=P,i=P*P*this.dot(this.grad3[L],b,E));let U=.5-_*_-R*R;U<0?a=0:(U*=U,a=U*U*this.dot(this.grad3[w],_,R));let B=.5-A*A-I*I;return B<0?r=0:(B*=B,r=B*B*this.dot(this.grad3[C],A,I)),70*(i+a+r)}noise3d(e,t,i){let a,r,s,c,f=(e+t+i)*.3333333333333333,M=Math.floor(e+f),y=Math.floor(t+f),V=Math.floor(i+f),T=1/6,b=(M+y+V)*T,E=M-b,N=y-b,W=V-b,_=e-E,R=t-N,A=i-W,I,F,S,L,w,C;_>=R?R>=A?(I=1,F=0,S=0,L=1,w=1,C=0):_>=A?(I=1,F=0,S=0,L=1,w=0,C=1):(I=0,F=0,S=1,L=1,w=0,C=1):R<A?(I=0,F=0,S=1,L=0,w=1,C=1):_<A?(I=0,F=1,S=0,L=0,w=1,C=1):(I=0,F=1,S=0,L=1,w=1,C=0);let P=_-I+T,U=R-F+T,B=A-S+T,G=_-L+2*T,ee=R-w+2*T,oe=A-C+2*T,te=_-1+3*T,le=R-1+3*T,O=A-1+3*T,ie=M&255,Y=y&255,k=V&255,re=this.perm[ie+this.perm[Y+this.perm[k]]]%12,ce=this.perm[ie+I+this.perm[Y+F+this.perm[k+S]]]%12,fe=this.perm[ie+L+this.perm[Y+w+this.perm[k+C]]]%12,de=this.perm[ie+1+this.perm[Y+1+this.perm[k+1]]]%12,Q=.6-_*_-R*R-A*A;Q<0?a=0:(Q*=Q,a=Q*Q*this.dot3(this.grad3[re],_,R,A));let q=.6-P*P-U*U-B*B;q<0?r=0:(q*=q,r=q*q*this.dot3(this.grad3[ce],P,U,B));let $=.6-G*G-ee*ee-oe*oe;$<0?s=0:($*=$,s=$*$*this.dot3(this.grad3[fe],G,ee,oe));let K=.6-te*te-le*le-O*O;return K<0?c=0:(K*=K,c=K*K*this.dot3(this.grad3[de],te,le,O)),32*(a+r+s+c)}noise4d(e,t,i,a){let r=this.grad4,s=this.simplex,c=this.perm,d=(Math.sqrt(5)-1)/4,f=(5-Math.sqrt(5))/20,M,y,V,T,b,E=(e+t+i+a)*d,N=Math.floor(e+E),W=Math.floor(t+E),_=Math.floor(i+E),R=Math.floor(a+E),A=(N+W+_+R)*f,I=N-A,F=W-A,S=_-A,L=R-A,w=e-I,C=t-F,P=i-S,U=a-L,B=w>C?32:0,G=w>P?16:0,ee=C>P?8:0,oe=w>U?4:0,te=C>U?2:0,le=P>U?1:0,O=B+G+ee+oe+te+le,ie=s[O][0]>=3?1:0,Y=s[O][1]>=3?1:0,k=s[O][2]>=3?1:0,re=s[O][3]>=3?1:0,ce=s[O][0]>=2?1:0,fe=s[O][1]>=2?1:0,de=s[O][2]>=2?1:0,Q=s[O][3]>=2?1:0,q=s[O][0]>=1?1:0,$=s[O][1]>=1?1:0,K=s[O][2]>=1?1:0,Ne=s[O][3]>=1?1:0,Me=w-ie+f,Te=C-Y+f,_e=P-k+f,Ae=U-re+f,Ve=w-ce+2*f,Fe=C-fe+2*f,u=P-de+2*f,o=U-Q+2*f,h=w-q+3*f,v=C-$+3*f,D=P-K+3*f,x=U-Ne+3*f,H=w-1+4*f,z=C-1+4*f,p=P-1+4*f,J=U-1+4*f,X=N&255,ue=W&255,Se=_&255,we=R&255,Qe=c[X+c[ue+c[Se+c[we]]]]%32,Xe=c[X+ie+c[ue+Y+c[Se+k+c[we+re]]]]%32,Ye=c[X+ce+c[ue+fe+c[Se+de+c[we+Q]]]]%32,$e=c[X+q+c[ue+$+c[Se+K+c[we+Ne]]]]%32,Ke=c[X+1+c[ue+1+c[Se+1+c[we+1]]]]%32,ye=.6-w*w-C*C-P*P-U*U;ye<0?M=0:(ye*=ye,M=ye*ye*this.dot4(r[Qe],w,C,P,U));let be=.6-Me*Me-Te*Te-_e*_e-Ae*Ae;be<0?y=0:(be*=be,y=be*be*this.dot4(r[Xe],Me,Te,_e,Ae));let Pe=.6-Ve*Ve-Fe*Fe-u*u-o*o;Pe<0?V=0:(Pe*=Pe,V=Pe*Pe*this.dot4(r[Ye],Ve,Fe,u,o));let De=.6-h*h-v*v-D*D-x*x;De<0?T=0:(De*=De,T=De*De*this.dot4(r[$e],h,v,D,x));let Ee=.6-H*H-z*z-p*p-J*J;return Ee<0?b=0:(Ee*=Ee,b=Ee*Ee*this.dot4(r[Ke],H,z,p,J)),27*(M+y+V+T+b)}};var ge=class l extends me{constructor(e,t,i,a,r,s,c){super(),this.width=i!==void 0?i:512,this.height=a!==void 0?a:512,this.clear=!0,this.camera=t,this.scene=e,this.output=0,this._renderGBuffer=!0,this._visibilityCache=new Map,this.blendIntensity=1,this.pdRings=2,this.pdRadiusExponent=2,this.pdSamples=16,this.gtaoNoiseTexture=We(),this.pdNoiseTexture=this.generateNoise(),this.gtaoRenderTarget=new n.WebGLRenderTarget(this.width,this.height,{type:n.HalfFloatType}),this.pdRenderTarget=this.gtaoRenderTarget.clone(),this.gtaoMaterial=new n.ShaderMaterial({defines:Object.assign({},Ce.defines),uniforms:n.UniformsUtils.clone(Ce.uniforms),vertexShader:Ce.vertexShader,fragmentShader:Ce.fragmentShader,blending:n.NoBlending,depthTest:!1,depthWrite:!1}),this.gtaoMaterial.defines.PERSPECTIVE_CAMERA=this.camera.isPerspectiveCamera?1:0,this.gtaoMaterial.uniforms.tNoise.value=this.gtaoNoiseTexture,this.gtaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.normalMaterial=new n.MeshNormalMaterial,this.normalMaterial.blending=n.NoBlending,this.pdMaterial=new n.ShaderMaterial({defines:Object.assign({},Re.defines),uniforms:n.UniformsUtils.clone(Re.uniforms),vertexShader:Re.vertexShader,fragmentShader:Re.fragmentShader,depthTest:!1,depthWrite:!1}),this.pdMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.pdMaterial.uniforms.tNoise.value=this.pdNoiseTexture,this.pdMaterial.uniforms.resolution.value.set(this.width,this.height),this.pdMaterial.uniforms.lumaPhi.value=10,this.pdMaterial.uniforms.depthPhi.value=2,this.pdMaterial.uniforms.normalPhi.value=3,this.pdMaterial.uniforms.radius.value=8,this.depthRenderMaterial=new n.ShaderMaterial({defines:Object.assign({},Ue.defines),uniforms:n.UniformsUtils.clone(Ue.uniforms),vertexShader:Ue.vertexShader,fragmentShader:Ue.fragmentShader,blending:n.NoBlending}),this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new n.ShaderMaterial({uniforms:n.UniformsUtils.clone(pe.uniforms),vertexShader:pe.vertexShader,fragmentShader:pe.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:n.DstColorFactor,blendDst:n.ZeroFactor,blendEquation:n.AddEquation,blendSrcAlpha:n.DstAlphaFactor,blendDstAlpha:n.ZeroFactor,blendEquationAlpha:n.AddEquation}),this.blendMaterial=new n.ShaderMaterial({uniforms:n.UniformsUtils.clone(ze.uniforms),vertexShader:ze.vertexShader,fragmentShader:ze.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blending:n.CustomBlending,blendSrc:n.DstColorFactor,blendDst:n.ZeroFactor,blendEquation:n.AddEquation,blendSrcAlpha:n.DstAlphaFactor,blendDstAlpha:n.ZeroFactor,blendEquationAlpha:n.AddEquation}),this.fsQuad=new ne(null),this.originalClearColor=new n.Color,this.setGBuffer(r?r.depthTexture:void 0,r?r.normalTexture:void 0),s!==void 0&&this.updateGtaoMaterial(s),c!==void 0&&this.updatePdMaterial(c)}dispose(){this.gtaoNoiseTexture.dispose(),this.pdNoiseTexture.dispose(),this.normalRenderTarget.dispose(),this.gtaoRenderTarget.dispose(),this.pdRenderTarget.dispose(),this.normalMaterial.dispose(),this.pdMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this.fsQuad.dispose()}get gtaoMap(){return this.pdRenderTarget.texture}setGBuffer(e,t){e!==void 0?(this.depthTexture=e,this.normalTexture=t,this._renderGBuffer=!1):(this.depthTexture=new n.DepthTexture,this.depthTexture.format=n.DepthStencilFormat,this.depthTexture.type=n.UnsignedInt248Type,this.normalRenderTarget=new n.WebGLRenderTarget(this.width,this.height,{minFilter:n.NearestFilter,magFilter:n.NearestFilter,type:n.HalfFloatType,depthTexture:this.depthTexture}),this.normalTexture=this.normalRenderTarget.texture,this._renderGBuffer=!0);let i=this.normalTexture?1:0,a=this.depthTexture===this.normalTexture?"w":"x";this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE=i,this.gtaoMaterial.defines.DEPTH_SWIZZLING=a,this.gtaoMaterial.uniforms.tNormal.value=this.normalTexture,this.gtaoMaterial.uniforms.tDepth.value=this.depthTexture,this.pdMaterial.defines.NORMAL_VECTOR_TYPE=i,this.pdMaterial.defines.DEPTH_SWIZZLING=a,this.pdMaterial.uniforms.tNormal.value=this.normalTexture,this.pdMaterial.uniforms.tDepth.value=this.depthTexture,this.depthRenderMaterial.uniforms.tDepth.value=this.normalRenderTarget.depthTexture}setSceneClipBox(e){e?(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX!==1,this.gtaoMaterial.defines.SCENE_CLIP_BOX=1,this.gtaoMaterial.uniforms.sceneBoxMin.value.copy(e.min),this.gtaoMaterial.uniforms.sceneBoxMax.value.copy(e.max)):(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX===0,this.gtaoMaterial.defines.SCENE_CLIP_BOX=0)}updateGtaoMaterial(e){e.radius!==void 0&&(this.gtaoMaterial.uniforms.radius.value=e.radius),e.distanceExponent!==void 0&&(this.gtaoMaterial.uniforms.distanceExponent.value=e.distanceExponent),e.thickness!==void 0&&(this.gtaoMaterial.uniforms.thickness.value=e.thickness),e.distanceFallOff!==void 0&&(this.gtaoMaterial.uniforms.distanceFallOff.value=e.distanceFallOff,this.gtaoMaterial.needsUpdate=!0),e.scale!==void 0&&(this.gtaoMaterial.uniforms.scale.value=e.scale),e.samples!==void 0&&e.samples!==this.gtaoMaterial.defines.SAMPLES&&(this.gtaoMaterial.defines.SAMPLES=e.samples,this.gtaoMaterial.needsUpdate=!0),e.screenSpaceRadius!==void 0&&(e.screenSpaceRadius?1:0)!==this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS&&(this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS=e.screenSpaceRadius?1:0,this.gtaoMaterial.needsUpdate=!0)}updatePdMaterial(e){let t=!1;e.lumaPhi!==void 0&&(this.pdMaterial.uniforms.lumaPhi.value=e.lumaPhi),e.depthPhi!==void 0&&(this.pdMaterial.uniforms.depthPhi.value=e.depthPhi),e.normalPhi!==void 0&&(this.pdMaterial.uniforms.normalPhi.value=e.normalPhi),e.radius!==void 0&&e.radius!==this.radius&&(this.pdMaterial.uniforms.radius.value=e.radius),e.radiusExponent!==void 0&&e.radiusExponent!==this.pdRadiusExponent&&(this.pdRadiusExponent=e.radiusExponent,t=!0),e.rings!==void 0&&e.rings!==this.pdRings&&(this.pdRings=e.rings,t=!0),e.samples!==void 0&&e.samples!==this.pdSamples&&(this.pdSamples=e.samples,t=!0),t&&(this.pdMaterial.defines.SAMPLES=this.pdSamples,this.pdMaterial.defines.SAMPLE_VECTORS=Ge(this.pdSamples,this.pdRings,this.pdRadiusExponent),this.pdMaterial.needsUpdate=!0)}render(e,t,i){switch(this._renderGBuffer&&(this.overrideVisibility(),this.renderOverride(e,this.normalMaterial,this.normalRenderTarget,7829503,1),this.restoreVisibility()),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy(this.camera.matrixWorld),this.renderPass(e,this.gtaoMaterial,this.gtaoRenderTarget,16777215,1),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.renderPass(e,this.pdMaterial,this.pdRenderTarget,16777215,1),this.output){case l.OUTPUT.Off:break;case l.OUTPUT.Diffuse:this.copyMaterial.uniforms.tDiffuse.value=i.texture,this.copyMaterial.blending=n.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case l.OUTPUT.AO:this.copyMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.copyMaterial.blending=n.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case l.OUTPUT.Denoise:this.copyMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.copyMaterial.blending=n.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case l.OUTPUT.Depth:this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.renderPass(e,this.depthRenderMaterial,this.renderToScreen?null:t);break;case l.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalRenderTarget.texture,this.copyMaterial.blending=n.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t);break;case l.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=i.texture,this.copyMaterial.blending=n.NoBlending,this.renderPass(e,this.copyMaterial,this.renderToScreen?null:t),this.blendMaterial.uniforms.intensity.value=this.blendIntensity,this.blendMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.renderPass(e,this.blendMaterial,this.renderToScreen?null:t);break;default:console.warn("THREE.GTAOPass: Unknown output type.")}}renderPass(e,t,i,a,r){e.getClearColor(this.originalClearColor);let s=e.getClearAlpha(),c=e.autoClear;e.setRenderTarget(i),e.autoClear=!1,a!=null&&(e.setClearColor(a),e.setClearAlpha(r||0),e.clear()),this.fsQuad.material=t,this.fsQuad.render(e),e.autoClear=c,e.setClearColor(this.originalClearColor),e.setClearAlpha(s)}renderOverride(e,t,i,a,r){e.getClearColor(this.originalClearColor);let s=e.getClearAlpha(),c=e.autoClear;e.setRenderTarget(i),e.autoClear=!1,a=t.clearColor||a,r=t.clearAlpha||r,a!=null&&(e.setClearColor(a),e.setClearAlpha(r||0),e.clear()),this.scene.overrideMaterial=t,e.render(this.scene,this.camera),this.scene.overrideMaterial=null,e.autoClear=c,e.setClearColor(this.originalClearColor),e.setClearAlpha(s)}setSize(e,t){this.width=e,this.height=t,this.gtaoRenderTarget.setSize(e,t),this.normalRenderTarget.setSize(e,t),this.pdRenderTarget.setSize(e,t),this.gtaoMaterial.uniforms.resolution.value.set(e,t),this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.pdMaterial.uniforms.resolution.value.set(e,t),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)}overrideVisibility(){let e=this.scene,t=this._visibilityCache;e.traverse(function(i){t.set(i,i.visible),(i.isPoints||i.isLine)&&(i.visible=!1)})}restoreVisibility(){let e=this.scene,t=this._visibilityCache;e.traverse(function(i){let a=t.get(i);i.visible=a}),t.clear()}generateNoise(e=64){let t=new Oe,i=e*e*4,a=new Uint8Array(i);for(let s=0;s<e;s++)for(let c=0;c<e;c++){let d=s,f=c;a[(s*e+c)*4]=(t.noise(d,f)*.5+.5)*255,a[(s*e+c)*4+1]=(t.noise(d+e,f)*.5+.5)*255,a[(s*e+c)*4+2]=(t.noise(d,f+e)*.5+.5)*255,a[(s*e+c)*4+3]=(t.noise(d+e,f+e)*.5+.5)*255}let r=new n.DataTexture(a,e,e,n.RGBAFormat,n.UnsignedByteType);return r.wrapS=n.RepeatWrapping,r.wrapT=n.RepeatWrapping,r.needsUpdate=!0,r}};ge.OUTPUT={Off:-1,Default:0,Diffuse:1,Depth:2,Normal:3,AO:4,Denoise:5};var m=he(se(),1);var qe=he(se(),1),Ze={name:"LuminosityHighPassShader",shaderID:"luminosityHighPass",uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new qe.Color(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`};var xe=class l extends me{constructor(e,t,i,a){super(),this.strength=t!==void 0?t:1,this.radius=i,this.threshold=a,this.resolution=e!==void 0?new m.Vector2(e.x,e.y):new m.Vector2(256,256),this.clearColor=new m.Color(0,0,0),this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let r=Math.round(this.resolution.x/2),s=Math.round(this.resolution.y/2);this.renderTargetBright=new m.WebGLRenderTarget(r,s,{type:m.HalfFloatType}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let y=0;y<this.nMips;y++){let V=new m.WebGLRenderTarget(r,s,{type:m.HalfFloatType});V.texture.name="UnrealBloomPass.h"+y,V.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(V);let T=new m.WebGLRenderTarget(r,s,{type:m.HalfFloatType});T.texture.name="UnrealBloomPass.v"+y,T.texture.generateMipmaps=!1,this.renderTargetsVertical.push(T),r=Math.round(r/2),s=Math.round(s/2)}let c=Ze;this.highPassUniforms=m.UniformsUtils.clone(c.uniforms),this.highPassUniforms.luminosityThreshold.value=a,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new m.ShaderMaterial({uniforms:this.highPassUniforms,vertexShader:c.vertexShader,fragmentShader:c.fragmentShader}),this.separableBlurMaterials=[];let d=[3,5,7,9,11];r=Math.round(this.resolution.x/2),s=Math.round(this.resolution.y/2);for(let y=0;y<this.nMips;y++)this.separableBlurMaterials.push(this.getSeperableBlurMaterial(d[y])),this.separableBlurMaterials[y].uniforms.invSize.value=new m.Vector2(1/r,1/s),r=Math.round(r/2),s=Math.round(s/2);this.compositeMaterial=this.getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let f=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=f,this.bloomTintColors=[new m.Vector3(1,1,1),new m.Vector3(1,1,1),new m.Vector3(1,1,1),new m.Vector3(1,1,1),new m.Vector3(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors;let M=pe;this.copyUniforms=m.UniformsUtils.clone(M.uniforms),this.blendMaterial=new m.ShaderMaterial({uniforms:this.copyUniforms,vertexShader:M.vertexShader,fragmentShader:M.fragmentShader,blending:m.AdditiveBlending,depthTest:!1,depthWrite:!1,transparent:!0}),this.enabled=!0,this.needsSwap=!1,this._oldClearColor=new m.Color,this.oldClearAlpha=1,this.basic=new m.MeshBasicMaterial,this.fsQuad=new ne(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this.basic.dispose(),this.fsQuad.dispose()}setSize(e,t){let i=Math.round(e/2),a=Math.round(t/2);this.renderTargetBright.setSize(i,a);for(let r=0;r<this.nMips;r++)this.renderTargetsHorizontal[r].setSize(i,a),this.renderTargetsVertical[r].setSize(i,a),this.separableBlurMaterials[r].uniforms.invSize.value=new m.Vector2(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2)}render(e,t,i,a,r){e.getClearColor(this._oldClearColor),this.oldClearAlpha=e.getClearAlpha();let s=e.autoClear;e.autoClear=!1,e.setClearColor(this.clearColor,0),r&&e.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this.fsQuad.material=this.basic,this.basic.map=i.texture,e.setRenderTarget(null),e.clear(),this.fsQuad.render(e)),this.highPassUniforms.tDiffuse.value=i.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this.fsQuad.material=this.materialHighPassFilter,e.setRenderTarget(this.renderTargetBright),e.clear(),this.fsQuad.render(e);let c=this.renderTargetBright;for(let d=0;d<this.nMips;d++)this.fsQuad.material=this.separableBlurMaterials[d],this.separableBlurMaterials[d].uniforms.colorTexture.value=c.texture,this.separableBlurMaterials[d].uniforms.direction.value=l.BlurDirectionX,e.setRenderTarget(this.renderTargetsHorizontal[d]),e.clear(),this.fsQuad.render(e),this.separableBlurMaterials[d].uniforms.colorTexture.value=this.renderTargetsHorizontal[d].texture,this.separableBlurMaterials[d].uniforms.direction.value=l.BlurDirectionY,e.setRenderTarget(this.renderTargetsVertical[d]),e.clear(),this.fsQuad.render(e),c=this.renderTargetsVertical[d];this.fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,e.setRenderTarget(this.renderTargetsHorizontal[0]),e.clear(),this.fsQuad.render(e),this.fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,r&&e.state.buffers.stencil.setTest(!0),this.renderToScreen?(e.setRenderTarget(null),this.fsQuad.render(e)):(e.setRenderTarget(i),this.fsQuad.render(e)),e.setClearColor(this._oldClearColor,this.oldClearAlpha),e.autoClear=s}getSeperableBlurMaterial(e){let t=[];for(let i=0;i<e;i++)t.push(.39894*Math.exp(-.5*i*i/(e*e))/e);return new m.ShaderMaterial({defines:{KERNEL_RADIUS:e},uniforms:{colorTexture:{value:null},invSize:{value:new m.Vector2(.5,.5)},direction:{value:new m.Vector2(.5,.5)},gaussianCoefficients:{value:t}},vertexShader:`varying vec2 vUv;
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
				}`})}getCompositeMaterial(e){return new m.ShaderMaterial({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`varying vec2 vUv;
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
				}`})}};xe.BlurDirectionX=new m.Vector2(1,0);xe.BlurDirectionY=new m.Vector2(0,1);var Z={ao:.6,bloom:.3,vig:0,vigExport:.3,grain:.12,contrast:0,keyR:.07},Ie=(l,e)=>{let t=1,i=0;for(;l>0;)t/=e,i+=t*(l%e),l=Math.floor(l/e);return i},He="bool bad(vec3 v){ return !(abs(v.x) < 1e5 && abs(v.y) < 1e5 && abs(v.z) < 1e5); }   // true for NaN and Inf too",ut="varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }",Le=(l,e)=>new g.ShaderMaterial({vertexShader:ut,fragmentShader:l,uniforms:e,depthTest:!1,depthWrite:!1,blending:g.NoBlending});function ht(l){let{renderer:e,scene:t,camera:i,key:a,viewport:r}=l,s=l.low,c=!window.__forceHalf&&e.extensions.has("EXT_color_buffer_float")?g.FloatType:g.HalfFloatType,d=+new URLSearchParams(location.search).get("n")||Math.min(s?16:64,c===g.FloatType?64:24),f=(u,o={})=>new g.WebGLRenderTarget(1,1,{type:u,depthBuffer:!1,...o}),M=f(g.HalfFloatType,{samples:s?0:4,depthBuffer:!0}),y=f(g.HalfFloatType),V=[0,1].map(()=>f(c,{minFilter:g.NearestFilter,magFilter:g.NearestFilter})),T=0,b=1,E=1,N=0,W=0,_=!1,R="",A=0,I=new ne(null),F=(u,o)=>{I.material=u,e.setRenderTarget(o),I.render(e)},S=new ge(t,i,1,1);S.output=ge.OUTPUT.Off,S.normalMaterial.side=g.DoubleSide,S.updatePdMaterial({radius:6});let L=(u,o,h)=>{u.fragmentShader.includes(o)||console.warn("GTAO noise patch missed"),u.fragmentShader=u.fragmentShader.replace("uniform sampler2D tNoise;","uniform sampler2D tNoise; uniform float uFrame;").split(o).join(o+h),u.uniforms.uFrame={value:0},u.needsUpdate=!0};L(S.gtaoMaterial,"vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);","vec2 nd = noiseTexel.xy * 2.0 - 1.0; float na = atan(nd.y, nd.x) + uFrame * 2.399963; noiseTexel.xy = vec2(cos(na), sin(na)) * 0.5 + 0.5; noiseTexel.w = fract(noiseTexel.w + uFrame * 0.7548777);"),L(S.pdMaterial,"vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);","noiseTexel = fract(noiseTexel + uFrame * 0.618034);");let w=new xe(new g.Vector2(1,1),Z.bloom,.7,6);w.highPassUniforms.smoothWidth.value=.6;let C=Le(`uniform sampler2D tScene, tAO, tNormal; uniform float uAO, uInject, uGuard; uniform mat4 uCam; varying vec2 vUv;
${He}
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
}`,{uInject:{value:0},uGuard:{value:1},tScene:{value:null},tAO:{value:null},tNormal:{value:null},uAO:{value:Z.ao*2},uCam:{value:new g.Matrix4}}),P=Le(`uniform sampler2D tPrev, tNew; uniform float uW, uGuard; varying vec2 vUv;
${He}
void main(){
  vec4 p = texture2D(tPrev, vUv), n = texture2D(tNew, vUv);
  if (uGuard > .5) {
    bool nb = n.a < 0. || bad(n.rgb) || !(n.a == n.a), pb = bad(p.rgb) || !(p.a == p.a);
    if (nb && pb) { gl_FragColor = vec4(0.); return; }
    if (nb) { gl_FragColor = uW >= 1. ? vec4(0.) : p; return; }   // a bad new texel: keep the average as it was
    if (pb) { gl_FragColor = n; return; }
  }
  gl_FragColor = mix(p, n, uW);
}`,{uGuard:{value:1},tPrev:{value:null},tNew:{value:null},uW:{value:1}}),U=Le(`uniform sampler2D tMap; uniform float uGuard; varying vec2 vUv;
${He}
void main(){ vec4 t = texture2D(tMap, vUv); if (uGuard > .5) t = (bad(t.rgb) || !(t.a == t.a)) ? vec4(0.) : vec4(clamp(t.rgb, 0., 64.), clamp(t.a, 0., 1.)); gl_FragColor = t; }   // keeps one hot texel from flooding the bloom mips
`,{uGuard:{value:1},tMap:{value:null}}),B=new g.DataTexture(new Uint8Array([0,0,0,0]),1,1);B.needsUpdate=!0;let G=Le(`precision highp float;
uniform sampler2D tAcc, tGlow; uniform float uVig, uGrain, uCon; varying vec2 vUv;
#include <tonemapping_pars_fragment>
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
${He}
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
}`,{tAcc:{value:null},tGlow:{value:null},uVig:{value:Z.vig},uGrain:{value:Z.grain},uCon:{value:Z.contrast}});G.toneMapped=!1;function ee(u,o){b=u,E=o,N=0;let h=s?.5:1;for(let v of[M,y,...V])v.setSize(b,E);S.setSize(Math.round(b*h),Math.round(E*h)),S.updateGtaoMaterial({samples:s?12:24,radius:.14,thickness:.35,distanceExponent:1}),w.setSize(b,E)}function oe(u){let o=[];return t.traverse(h=>{h.isMesh&&h.visible&&u(h)&&(h.visible=!1,o.push(h))}),()=>o.forEach(h=>{h.visible=!0})}let te=u=>[u.material].flat().filter(Boolean),le=u=>te(u).some(o=>o.transparent&&(!o.depthWrite||o.opacity<.98)||o.alphaTest>.4),O=u=>u.material===l.contactMat;function ie(u){let o=r.clientWidth,h=r.clientHeight,v=b/o,D=i.view?.enabled?i.view:null;i.setViewOffset(o,h,(D?D.offsetX:0)+(Ie(u+1,2)-.5)/v,(D?D.offsetY:0)+(Ie(u+1,3)-.5)/v,o,h)}let Y=new g.Vector3,k=new g.Vector3,re=new g.Vector3,ce=new g.Vector3;function fe(u){Y.copy(a.position),k.copy(Y).sub(a.target.position);let o=k.length();k.normalize(),re.crossVectors(k,Math.abs(k.y)>.95?new g.Vector3(1,0,0):new g.Vector3(0,1,0)).normalize(),ce.crossVectors(k,re);let h=o*(s?Z.keyR*.65:Z.keyR)*Math.sqrt(Ie(u+1,5)),v=2*Math.PI*Ie(u+1,7);a.position.addScaledVector(re,h*Math.cos(v)).addScaledVector(ce,h*Math.sin(v))}function de(){let u=2166136261,o=x=>{u=Math.imul(u^(Math.round(x*1e5)|0),16777619)},h=x=>{for(let H=0;H<x.length;H++)o(x[H])};h(i.matrixWorld.elements),h(i.projectionMatrix.elements),o(b),o(E),o(e.toneMappingExposure),o(t.environmentIntensity),o(t.environment?t.environment.id:-1),o(t.environmentRotation.y);let v=["map","bumpMap","roughnessMap","metalnessMap","normalMap","clearcoatMap","iridescenceMap"],D=(x,H)=>{if(!x.layers.isEnabled(l.overlayLayer)&&(o(x.visible?1:0),!!x.visible)){if(h(x.position.toArray()),h(x.quaternion.toArray()),h(x.scale.toArray()),x.matrixAutoUpdate||h(x.matrix.elements),x.isLight&&(o(x.intensity),o(x.color.r),o(x.color.g),o(x.color.b)),x.isMesh){let z=x.geometry;o(z.id),o(z.attributes.position?.version||0),o(z.index?.version||0),o(z.drawRange.count===1/0?0:z.drawRange.count);for(let p of te(x)){o(p.id),o(p.visible?1:0),o(p.opacity),o(p.side),o(p.transparent?1:0),o(p.alphaTest),o(p.depthWrite?1:0),o(p.clearcoat||0),o(p.clearcoatRoughness||0),o(p.sheen||0),o(p.iridescence||0),o(p.bumpScale||0),o(p.envMapIntensity??1),p.color&&(o(p.color.r),o(p.color.g),o(p.color.b)),p.emissive&&(o(p.emissive.r),o(p.emissive.g),o(p.emissive.b)),o(p.roughness??0),o(p.metalness??0),o(p.envMap?p.envMap.id:-1);for(let J of v)p[J]&&(o(p[J].id),o(p[J].version))}}if(!H)for(let z of x.children)D(z)}};return D(t),u}function Q(u){let o=performance.now(),h=a.position.clone(),v=i.view?.enabled?{...i.view}:null,D=a.shadow.radius;u&&(ie(u),fe(u),a.shadow.radius=Math.max(1,D*.5)),e.shadowMap.needsUpdate=!0,_=!0;let x=oe(O);e.setRenderTarget(M),e.render(t,i),S.gtaoMaterial.uniforms.uFrame.value=S.pdMaterial.uniforms.uFrame.value=u;let H=window.__noAOHide?()=>{}:oe(le);S.render(e,null,null),H(),x();let z=C.uniforms;z.tScene.value=M.texture,z.tAO.value=S.gtaoMap,z.tNormal.value=S.normalRenderTarget.texture;let p=window.__noGuard?0:1;z.uGuard.value=P.uniforms.uGuard.value=U.uniforms.uGuard.value=p,z.uInject.value=window.__inject===u?1:0,z.uCam.value.copy(i.matrixWorld),F(C,y),P.uniforms.tPrev.value=V[T].texture,P.uniforms.tNew.value=y.texture,P.uniforms.uW.value=1/(u+1),F(P,V[1-T]),T=1-T,v?i.setViewOffset(v.fullWidth,v.fullHeight,v.offsetX,v.offsetY,v.width,v.height):i.clearViewOffset(),a.position.copy(h),a.shadow.radius=D,window.__studioSync&&e.readRenderTargetPixels(V[T],0,0,1,1,new Float32Array(4)),W=performance.now()-o}function q(u=Z.vig){let o=B;Z.bloom>0&&(U.uniforms.tMap.value=V[T].texture,F(U,y),w.strength=Z.bloom*1.2,w.render(e,null,y,0,!1),o=w.renderTargetsHorizontal[0].texture),G.uniforms.tAcc.value=V[T].texture,G.uniforms.tGlow.value=o,G.uniforms.uVig.value=u,F(G,null)}function $(){e.setRenderTarget(M),e.render(t,i),G.uniforms.tAcc.value=M.texture,G.uniforms.tGlow.value=B,G.uniforms.uVig.value=Z.vig,F(G,null)}function K(u){let o=new Map;t.traverse(v=>{if(v.isMesh&&v.visible)for(let D of te(v))o.set(D,D.colorWrite)}),o.forEach((v,D)=>{D.colorWrite=!1}),e.autoClear=!1,e.setRenderTarget(null),e.clearDepth(),e.render(t,i),o.forEach((v,D)=>{D.colorWrite=v}),u();let h=i.layers.mask;i.layers.set(l.overlayLayer),e.render(t,i),i.layers.mask=h,e.autoClear=!0}function Ne(u){let o=e.getDrawingBufferSize(new g.Vector2);(o.x!==b||o.y!==E)&&ee(o.x,o.y);let h=u?de():R,v=u&&N>0&&h===R;R=h,A++,u&&!v&&(N=0,_&&(_=!1,l.staleShadow()));let D=l.overlaysShown(),x=l.hideOverlays(),H=e.autoClear;l.petLinear.value=1,u?v?q():$():(Q(N++),q()),l.petLinear.value=0,D?K(x):x(),e.autoClear=H,window.__studio={n:N,N:d,done:N>=d,sampleMs:W,W:b,H:E,low:s,half:c!==g.FloatType,frames:A,mb:Math.round(Me()/1048576)}}function Me(){let u=b*E,o=c===g.FloatType?16:8,h=s?.25:1,v=s?1:4;return u*(8*v+4*v+8+8+8+2*o)+u*h*16+u*8*2*(1/3)}async function Te(u,o,h,v,D){let x=e.getDrawingBufferSize(new g.Vector2),H=e.getContext();if(x.x!==u||x.y!==o)return!1;let z=M.samples;M.samples=0,M.dispose(),ee(u,o),R="";let p=l.hideOverlays(),J=!1;try{l.petLinear.value=1;for(let X=0;X<d;X++){if(D()||H.isContextLost())return!1;Q(X),N=X+1,v(N,d),X<d-1&&await new Promise(ue=>requestAnimationFrame(ue))}if(H.isContextLost())return!1;q(h?0:Z.vigExport),J=!0}finally{l.petLinear.value=0,p(),e.setRenderTarget(null),M.samples=z,M.dispose(),N=0,b=0,E=0}return J}return{frame:Ne,pending:()=>N<Math.min(d,window.__studioCap||d),release:()=>{ee(1,1),b=0,E=0,_=!1,R="",l.staleShadow(),window.__studio={n:0,N:d,done:!1,off:!0}},status:()=>({n:N,N:d}),still:Te,limit:()=>({px:s||c!==g.FloatType?8e6:12e6,side:4096})}}window.__bsRender={create:ht};})();
