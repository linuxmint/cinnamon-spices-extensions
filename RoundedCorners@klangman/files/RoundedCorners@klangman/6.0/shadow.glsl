// Soft shadow for a rounded window, drawn by a separate actor placed under the window
// surface (see ShadowEffect in corner.js). The actor's own content is ignored; the
// shadow is computed from the window's rounded rectangle.
//
// The shadow is a Gaussian blur of the rounded rectangle, computed analytically: the
// blur across x is exact (via erf), and the blur along y is integrated with a few
// samples. Technique from Evan Wallace, "Fast Rounded Rectangle Shadows"
// (https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/).
// Kevin Langman 2026

uniform sampler2D tex;

// Clutter's offscreen texture is padded around the actor (see corner.js, fboGeometry())
uniform float tex_width;
uniform float tex_height;
uniform float tex_offset_x;
uniform float tex_offset_y;

// The window's visible rectangle, in this actor's pixels
uniform float rect_x0;
uniform float rect_y0;
uniform float rect_x1;
uniform float rect_y1;
uniform float radius;
uniform bool corners_top;
uniform bool corners_bottom;

uniform float shadow_size;      // pixels the shadow extends beyond the window edge
uniform float shadow_opacity;   // 0..1 at the window edge
uniform float shadow_offset_y;  // pixels the shadow is moved down
uniform float cutout_inset;     // the no-shadow area is this much smaller than the rect

// Signed distance from p to the edge of a rounded box: < 0 inside, > 0 outside
float rounded_box_sdf(vec2 p, vec2 center, vec2 half_size, float r) {
    vec2 q = abs(p - center) - half_size + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Corner radius for a point above (y < 0) or below the box centre
float corner_radius_at(float y) {
    return (y < 0.) ? (corners_top ? radius : 0.) : (corners_bottom ? radius : 0.);
}

// Error function, Abramowitz & Stegun 7.1.27 (max error ~5e-4)
vec2 erf2(vec2 x) {
    vec2 s = sign(x);
    vec2 a = abs(x);
    vec2 t = 1. + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    t *= t;
    return s - s / (t * t);
}

float gaussian(float x, float sigma) {
    return exp(-(x * x) / (2. * sigma * sigma)) / (2.5066283 * sigma);   // sqrt(2*pi) = 2.5066283
}

// Blur across x of one horizontal slice (at height y from the centre) of the rounded box
float slice_blur_x(float x, float y, float sigma, float r, vec2 half_size) {
    float delta = min(half_size.y - r - abs(y), 0.);
    float half_width = half_size.x - r + sqrt(max(0., r * r - delta * delta));
    vec2 integral = 0.5 + 0.5 * erf2((x + vec2(-half_width, half_width)) * (0.7071068 / sigma));
    return integral.y - integral.x;
}

// Coverage (0..1) of the rounded box blurred with a Gaussian of the given sigma.
// p is relative to the box centre.
float rounded_box_shadow(vec2 p, vec2 half_size, float sigma) {
    // Only y offsets within 3 sigma matter, and only inside the box
    float low = p.y - half_size.y;
    float high = p.y + half_size.y;
    float start = clamp(-3. * sigma, low, high);
    float end = clamp(3. * sigma, low, high);
    float dy = (end - start) / 4.;
    float y = start + dy * 0.5;
    float value = 0.;
    for (int i = 0; i < 4; i++) {
        float sy = p.y - y;   // the slice's height relative to the box centre
        value += slice_blur_x(p.x, sy, sigma, corner_radius_at(sy), half_size) * gaussian(y, sigma) * dy;
        y += dy;
    }
    return value;
}

void main(void) {
    vec2 uv = cogl_tex_coord_in[0].xy;
    vec2 pos = uv * vec2(tex_width, tex_height) - vec2(tex_offset_x, tex_offset_y);

    vec2 center = vec2(rect_x0 + rect_x1, rect_y0 + rect_y1) * 0.5;
    vec2 half_size = vec2(rect_x1 - rect_x0, rect_y1 - rect_y0) * 0.5;

    // No shadow under the window itself (it would show through translucent windows)
    vec2 p = pos - center;
    float cr = corner_radius_at(p.y);
    // Cut out a slightly smaller, concentric rounded box, so the shadow continues under
    // the clip's outset band (seamless whether or not the app draws a border line there)
    float dw = rounded_box_sdf(pos, center, half_size - cutout_inset, max(cr - cutout_inset, 0.));
    float window_coverage = clamp(0.5 - dw, 0., 1.);
    if (window_coverage >= 1. || shadow_size <= 0.) {
        cogl_color_out = vec4(0.);
        return;
    }

    // shadow_size is how far the shadow visibly reaches: about 2.5 sigma
    float sigma = max(shadow_size / 2.5, 0.5);
    float blur = rounded_box_shadow(p - vec2(0., shadow_offset_y), half_size, sigma);

    // A blurred edge is at 50% coverage, so double it: shadow_opacity is then the
    // strength right at a straight window edge, and corners fall off more, as in a real blur
    float a = shadow_opacity * min(1., 2. * blur) * (1. - window_coverage);

    // cogl_color_in carries the actor's paint opacity (e.g. window fade animations)
    cogl_color_out = vec4(0., 0., 0., a) * cogl_color_in.a;
}
