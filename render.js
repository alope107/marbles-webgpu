import { circleStruct } from "./structs.js";
export const renderShaderCode = /* wgsl */ `
${circleStruct.code}

const PI = radians(180.0);

@group(0) @binding(0) var<storage, read> circles : array<Circle>; 

@vertex fn triangle(
    @builtin(vertex_index) vertexIdx : u32) -> @builtin(position) vec4f {
    _ = circles[0].radius;
    let center = vec2f(0, 0);
    let r = select(0., .3, (vertexIdx & 1) == 0); // Alternate between edges and center
    let segments = 16.;

    // TODO precompute matrix
    let angle = 2 * PI * f32(vertexIdx) / (2*segments);

    return vec4f(center + (r * vec2f(cos(angle), sin(angle))), 0, 1.);
}

@fragment fn solidColor(@builtin(position) position : vec4f) -> @location(0) vec4f {
    return vec4(1, 0, 0, 1);
}
`;