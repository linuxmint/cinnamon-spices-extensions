uniform sampler2D tex;
uniform float sigma;
uniform int dir;
uniform float brightness;
uniform float width;
uniform float height;

vec4 getTexture(vec2 uv) {
    if (uv.x < 3. / width)
        uv.x = 3. / width;

    if (uv.y < 3. / height)
        uv.y = 3. / height;

    if (uv.x > 1. - 3. / width)
        uv.x = 1. - 3. / width;

    if (uv.y > 1. - 3. / height)
        uv.y = 1. - 3. / height;

    return texture2D(tex, uv);
}

void blurcinnamon_main() {
    vec2 uv = cogl_tex_coord_in[0].xy;
    vec2 direction = vec2(dir, (1.0 - dir));

    float pixel_step;
    if (dir == 0)
        pixel_step = 1.0 / height;
    else
        pixel_step = 1.0 / width;

    vec3 gauss_coefficient;
    gauss_coefficient.x = 1.0 / (sqrt(2.0 * 3.14159265) * sigma);
    gauss_coefficient.y = exp(-0.5 / (sigma * sigma));
    gauss_coefficient.z = gauss_coefficient.y * gauss_coefficient.y;

    float gauss_coefficient_total = gauss_coefficient.x;

    vec4 ret = getTexture(uv) * gauss_coefficient.x;
    gauss_coefficient.xy *= gauss_coefficient.yz;

    int n_steps = int(ceil(1.5 * sigma)) * 2;

    for (int i = 1; i <= n_steps; i += 2) {
        float coefficient_subtotal = gauss_coefficient.x;
        gauss_coefficient.xy *= gauss_coefficient.yz;
        coefficient_subtotal += gauss_coefficient.x;
        if (coefficient_subtotal <= 0.0)
            break;
        
        float gauss_ratio = gauss_coefficient.x / coefficient_subtotal;

        float foffset = float(i) + gauss_ratio;
        vec2 offset = direction * foffset * pixel_step;

        ret += getTexture(uv + offset) * coefficient_subtotal;
        ret += getTexture(uv - offset) * coefficient_subtotal;

        gauss_coefficient_total += 2.0 * coefficient_subtotal;
        gauss_coefficient.xy *= gauss_coefficient.yz;
    }
    vec4 outColor = ret / gauss_coefficient_total;

    // apply brightness on the second pass (dir==0 comes last)
    if (dir == 0) {
        outColor.rgb *= brightness;
    }

    cogl_color_out = outColor;
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
