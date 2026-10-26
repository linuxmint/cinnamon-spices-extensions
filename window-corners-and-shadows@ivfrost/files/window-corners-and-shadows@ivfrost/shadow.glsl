// The shadow behind a window, drawn by the extension rather than by the app.
//
// A window's own shadow is one blurred silhouette, sized by whatever toolkit
// drew it - and it is the thing this extension has to clip away at the rounded
// corners anyway, because it is square where the window is not. So the
// extension draws the shadow instead, and draws it the way native chrome
// stacks one: a tight contact shadow that holds the window down against what
// is behind it, a middle one, and a wide ambient one that lifts it off. The
// light is imagined to come from above, so each layer is pushed down a little
// and the shadow reaches further below the window than above it.
//
// It runs over an actor sitting behind the window, sized to the window plus
// enough room for the shadow to fade out within - which is what boxSize is,
// with `windowRect` placing the window inside it. The shadow is a signed
// distance field rather than a blur: it costs nothing to make it smooth, and it
// follows the rounded corners exactly instead of being a blurred square.
//
// Added as a Cogl snippet, like corner.glsl: the functions below go in the
// snippet's declarations and the body of main() in its code. The values are
// uniforms, so a window moving, resizing or taking focus only costs a few
// floats rather than a shader compile.
//
// The uniform names deliberately avoid `width`, `height` and `strength`: Cogl's
// own fragment boilerplate declares uniforms by those names, and a value set on
// one of them does not reach the shader. `boxSize` and `shadowStrength` are the
// same numbers under names Cogl does not claim.

// The actor's size, in its own pixels.
uniform vec2 boxSize;

// The window's rectangle inside it: left, top, right, bottom.
uniform vec4 windowRect;

// The window's corner radius.
uniform float cornerRadius;

// How heavy the shadow is; 0 draws nothing at all.
uniform float shadowStrength;

// Signed distance to a rounded rectangle: negative inside, positive outside.
float sdRoundRect(vec2 p, vec4 r, float rad) {
    vec2 half = (r.zw - r.xy) * 0.5;
    vec2 c = (r.xy + r.zw) * 0.5;
    vec2 q = abs(p - c) - half + rad;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

// One layer of the stack: the same silhouette, pushed down by dy, fading out
// over `blur` pixels.
float shadowLayer(vec2 p, float dy, float blur, float alpha) {
    float d = sdRoundRect(p - vec2(0.0, dy), windowRect, cornerRadius);
    return alpha * shadowStrength * (1.0 - smoothstep(0.0, blur, d));
}

void main(void) {
    vec2 uv = cogl_tex_coord_in[0].xy;
    vec2 p = uv * boxSize;

    // Light weights on purpose. Composed, these three come to about a third
    // opaque at the window's edge and fade to nothing by forty pixels out.
    // Native window shadows are that soft: they read as the window sitting
    // above the desktop, not as a dark band drawn along its edge. Piling the
    // layers up any darker is what makes a shadow look like a stain, and on a
    // dark desktop it is the first thing the eye goes to.
    float contact = shadowLayer(p, 1.0, 6.0, 0.12);
    float mid = shadowLayer(p, 4.0, 16.0, 0.12);
    float ambient = shadowLayer(p, 10.0, 36.0, 0.16);

    // Translucent layers compose rather than add up, or the middle of the
    // shadow would go solid where they overlap.
    float a = 1.0 - (1.0 - contact) * (1.0 - mid) * (1.0 - ambient);

    // Black, premultiplied - what a shadow is.
    cogl_color_out = vec4(vec3(0.0), a);
}
