uniform sampler2D tex;
uniform float offset;
uniform float width;
uniform float height;

vec4 sampleBoundary(vec2 uv, vec2 uv_offset, vec2 pixel_step) {
    vec2 pos = clamp(uv + uv_offset * pixel_step, vec2(3.0 / width, 3.0 / height), vec2(1.0 - 3.0 / width, 1.0 - 3.0 / height));
    return texture2D(tex, pos);
}

void blurcinnamon_main() {
    vec2 uv = cogl_tex_coord_in[0].xy;
    vec2 pixel_step = vec2(1.0 / width, 1.0 / height);

    vec4 sum = texture2D(tex, uv) * 4.0;
    sum += sampleBoundary(uv, vec2(-offset * 0.5, -offset * 0.5), pixel_step);
    sum += sampleBoundary(uv, vec2( offset * 0.5, -offset * 0.5), pixel_step);
    sum += sampleBoundary(uv, vec2(-offset * 0.5,  offset * 0.5), pixel_step);
    sum += sampleBoundary(uv, vec2( offset * 0.5,  offset * 0.5), pixel_step);

    cogl_color_out = sum / 8.0;
}

// Apply the actor's paint opacity. ClutterOffscreenEffect passes the actor's paint opacity to the final
// on-screen pass only as the (premultiplied) pipeline colour, cogl_color_in. Inner passes in an effect chain
// are rendered with the opacity forced to 255 (cogl_color_in == 1), so multiplying in every shader applies
// the opacity exactly once. Without this, actor.opacity has no effect on any actor using these effects.
void main() {
    blurcinnamon_main();
    // The scene being blurred is meant to be opaque, but something drawn into it with the wrong blend can
    // leave its alpha a little below 1 (e.g. another extension's GLSLEffect over the wallpaper: right
    // colour, alpha of a*a + (1-a)). Every inner pass of an effect chain then stores that alpha squared
    // (see SNIPPET_CODE in effect_base.js), so after a few passes the unblurred scene behind shows through
    // on top of the blurred colour: a bright, unblurred band, worst with Dual Kawase's many passes. So
    // treat a mostly opaque result as opaque. The colour is left alone, it is already right. A mostly
    // transparent result (no content there at all) is passed on unchanged.
    if (cogl_color_out.a >= 0.5)
        cogl_color_out.a = 1.0;
    cogl_color_out *= cogl_color_in;
    // Break up the banding of 8-bit output, see effect_base.js
    cogl_color_out = blurcinnamon_dither(cogl_color_out);
}
