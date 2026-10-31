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
    cogl_color_out *= cogl_color_in;
}
