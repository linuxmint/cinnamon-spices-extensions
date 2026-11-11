//////////////////////////////////////////////////////////////////////////////////////////
//          )                                                   (                       //
//       ( /(   (  (               )    (       (  (  (         )\ )    (  (            //
//       )\()) ))\ )(   (         (     )\ )    )\))( )\  (    (()/( (  )\))(  (        //
//      ((_)\ /((_|()\  )\ )      )\  '(()/(   ((_)()((_) )\ )  ((_)))\((_)()\ )\       //
//      | |(_|_))( ((_)_(_/(    _((_))  )(_))  _(()((_|_)_(_/(  _| |((_)(()((_|(_)      //
//      | '_ \ || | '_| ' \))  | '  \()| || |  \ V  V / | ' \)) _` / _ \ V  V (_-<      //
//      |_.__/\_,_|_| |_||_|   |_|_|_|  \_, |   \_/\_/|_|_||_|\__,_\___/\_/\_//__/      //
//                                 |__/                                                 //
//////////////////////////////////////////////////////////////////////////////////////////

// SPDX-FileCopyrightText: Simon Schneegans <code@simonschneegans.de>
// SPDX-License-Identifier: GPL-3.0-or-later

// The content from common.glsl is automatically prepended to each shader effect.

// See assets/README.md for how this texture was created.
// brush.png is a 2048x1024 atlas: the left half holds brush sizes 1-3 in its R, G and B
// channels, the right half holds brush size 4 (grey). It used to be a single RGBA image,
// but St.TextureCache uploads with premultiplied alpha, which would scale R, G and B by
// the size-4 mask in the alpha channel.
uniform sampler2D uBrushTexture;
uniform float uBrushSize;

const float SHADOW_WIDTH = 0.03;
const float SHADOW_STEPS = 10.0;

// Returns the brush mask value of the selected brush size at texCoord.
float getBrush(vec2 texCoord) {
  int size = int(uBrushSize - 1.0);
  // Texel centres of one half, so linear filtering never samples the other half.
  float u = (0.5 + clamp(texCoord.x, 0.0, 1.0) * 1023.0) / 2048.0;
  if (size < 3) {
    return texture2D(uBrushTexture, vec2(u, texCoord.y))[size];
  }
  return texture2D(uBrushTexture, vec2(u + 0.5, texCoord.y)).r;
}

// Returns 1.0 if the window texture at the given texCoord should be painted.
float getMask(vec2 texCoord, float progress) {
  float brush = getBrush(texCoord);
  if (uForOpening) {
    return step(brush, progress);
  }
  
  return step(progress, brush);
}

void main() {

  vec4 oColor = getInputColor(iTexCoord.st);

  // This will be 0.0 in the masked-out areas.
  float mask = getMask(iTexCoord.st, uProgress);

  // Add a simple drop shadow below the remaining parts.
  if (mask == 0.0) {

    for (float i = 0.0; i < SHADOW_STEPS; ++i) {
      vec2 shadowTexCoord = iTexCoord.st - vec2(0.0, i * SHADOW_WIDTH / SHADOW_STEPS);
      float shadowMask = getMask(shadowTexCoord, uProgress);
      float shadowAlpha = (1.0 - i / SHADOW_STEPS) * shadowMask * getInputColor(shadowTexCoord).a;

      if (shadowAlpha > 0.0) {
        oColor = vec4(vec3(0.0), shadowAlpha * 0.2);
        break;
      }

      // If we arrived at the end of the shadow, make sure to set the alpha to 0.
      if (i == SHADOW_STEPS - 1.0) {
        oColor.a = 0.0;
      }
    }
  }

  setOutputColor(oColor);
}
