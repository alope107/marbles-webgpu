import { circleStruct } from "./structs.js";

export const randRange =  (min, max) => Math.random() * (max-min) + min; // random in range
export const randClip = () => randRange(-1, 1); // random inside clip bound
export const randColor = () => [Math.random(), Math.random(), Math.random(), 1.];
export const randCircles = (circleCount, radius) => {
    let circles = [];
    for(let i = 0; i < circleCount; i++) {
        circles.push({
            center: [randClip(), randClip()],
            color: randColor(),
            velocity: [0,0],
            radius
        });
    }

    return circleStruct.createFilledArray(circles);
}