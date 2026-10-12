// Мягкая тень без ступенек: фильтр карты тени по диску выборок, край задан в миллиметрах сцены
import * as THREE from 'three';

/* three.js filters a shadow over a few pixels of its map, so close up its edge shows the map's pixels as steps. Like
   games, «Баланс» and «Чётко» take 16 samples over a disk (a Vogel spiral), turned at every pixel of the screen so
   they do not line up, each sample itself blended between the map's four nearest pixels (no pixel edges in it). The
   disk is the shadow's soft edge: the light's shadow.radius in pixels of the map, set from a width in the scene
   (scene/camera.js), so the edge is as soft close up as from afar. It takes the place of three's PCF filter for the
   directional light; «Плавно» keeps three's cheaper PCFSoft. */
const SAMPLES = 16;
const HELPER = `
	float bsShadowLerp( sampler2D map, vec2 size, vec2 uv, float z ) {
		vec2 ts = 1.0 / size, f = fract( uv * size - 0.5 ), c = ( floor( uv * size - 0.5 ) + 0.5 ) * ts;
		return mix( mix( texture2DCompare( map, c, z ), texture2DCompare( map, c + vec2( ts.x, 0.0 ), z ), f.x ),
			mix( texture2DCompare( map, c + vec2( 0.0, ts.y ), z ), texture2DCompare( map, c + ts, z ), f.x ), f.y );
	}
	float bsShadowDisk( sampler2D map, vec2 size, float radius, vec2 uv, float z ) {
		float a = 6.2831853 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
		mat2 turn = mat2( cos( a ), sin( a ), - sin( a ), cos( a ) );
		vec2 sp = radius / size;
		float sum = 0.0;
		for ( int i = 0; i < ${SAMPLES}; i ++ ) {
			float t = float( i ) * 2.39996323, r = sqrt( ( float( i ) + 0.5 ) / ${SAMPLES}.0 );
			sum += bsShadowLerp( map, size, uv + turn * vec2( cos( t ), sin( t ) ) * r * sp, z );
		}
		return sum / ${SAMPLES}.0;
	}
`;
let done = false;
/* puts the filter into three's shadow code, once, before any material is built */
function initSoftShadows() {
  if (done) return; done = true;
  let src = THREE.ShaderChunk.shadowmap_pars_fragment;
  const at = src.indexOf('\tfloat getShadow( sampler2D shadowMap, vec2 shadowMapSize,');
  const a = src.indexOf('#if defined( SHADOWMAP_TYPE_PCF )', at), b = src.indexOf('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )', a);
  if (at < 0 || a < 0 || b < 0) { console.warn('soft shadows: three.js shadow code has changed'); return; }
  src = src.slice(0, a) + '#if defined( SHADOWMAP_TYPE_PCF )\n\n\t\t\tshadow = bsShadowDisk( shadowMap, shadowMapSize, shadowRadius, shadowCoord.xy, shadowCoord.z );\n\n\t\t' + src.slice(b);
  THREE.ShaderChunk.shadowmap_pars_fragment = src.slice(0, at) + HELPER + src.slice(at);
}

export { initSoftShadows };
