import { circleStruct, uniformsStruct } from "./structs.js";
import { global_invocation_index } from "./linear_indexing.js";
import { insertionSort } from "./sort.js";


export const computeShaderCode = /* wgsl */ `
${global_invocation_index}
${insertionSort}
${circleStruct.code}
${uniformsStruct.code}

// Need write access to old solely for sorting purposes
@group(0) @binding(0) var<storage, read_write> circlesOld : array<Circle>; 
@group(0) @binding(1) var<storage, read_write> circlesNew : array<Circle>;
@group(0) @binding(2) var<uniform> uniforms : Uniforms;

@compute @workgroup_size(1) fn sortAndDisplay(@builtin(workgroup_id) workgroup_id : vec3<u32>,
                                              @builtin(local_invocation_index) local_invocation_index: u32,
                                              @builtin(num_workgroups) num_workgroups: vec3<u32>) {
        let id = global_invocation_index(workgroup_id, local_invocation_index, num_workgroups,
                                         1 /* CHANGE ME WHEN WORKGROUP SIZE CHANGES */);
        if(id > 0) {return;}
        _ = uniforms.gravity.x;

        insertionSort(0, arrayLength(&circlesOld));
        let margin = 2. / f32(arrayLength(&circlesOld));
        for(var i =  0u; i < arrayLength(&circlesOld); i++) {
            var circle = circlesOld[i];
            circle.center.x = -1 + (margin * f32(i));
            circlesNew[i] = circle;
        }
}

// TODO: Proper workgroup sizes
@compute @workgroup_size(1) fn collide(@builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>) {
    let id = global_invocation_index(workgroup_id, local_invocation_index, num_workgroups,
                                        1 /* CHANGE ME WHEN WORKGROUP SIZE CHANGES */);
    // TODO: Move elsewhere???
    let CHUNK_SIZE = 10;
    let startCircleIdx = id*CHUNK_SIZE;
    if(startCircleIdx >= arrayLength(&circlesOld)) { return; }

    // ACK so much looping and branching
    // Can this be improved tactically, or do we need a whole new stategy?
    for(var i = startCircleIdx; i < startCircleIdx + CHUNK_SIZE; i++) {
        let currentCircle = circlesOld[i];
        let currentRightEdge = currentCircle.center.y + currentCircle.radius;
        let currentTop = currentCircle.center.x + currentCircle.radius;
        let currentBottom = currentCircle.center.x - currentCircle.radius;
        for (var j = i+1; j <  arrayLength(&circlesOld);j++) {
            let other = circlesOld[j];
            let otherLeftEdge = other.center.y - other.radius;
            if(otherLeftEdge < currentRightEdge) { // if we overlap bounding box in y
                let otherTop = other.center.x + other.radius;
                let otherBottom = other.center.x = other.radius;
                if(!(currentBottom > otherTop) && // if we overlap bounding box in x
                   !(currentTop < otherBottom)) {
                    let delta = currentCircle.center - other.center;
                    let dist = length(delta);
                    // TODO: branchless
                    let contactDist = other.radius + circlesOld[i].radius;
                    let diff = contactDist - dist;
                    if(diff > 0) {
                        // TODO: uneven movement
                        // TODO: If they are moving in the same direction, less velocity change! If moving in diff, more velocity change
                        // Perhaps use dot product or somesuch?
                        newMe.center += (delta * (diff/dist)) / 2;
                        newMe.velocity += (delta * (diff/dist)) / 2;
                    }
                }
            } else {
                break; // because we're sorted by left edge, once we find one that's too far, all the remaining will be too
            }
        }   
    }

 }
// TODO: better workgroup size UPDATE THE GLOBAL INDEX CALC IF CHANGED
@compute @workgroup_size(8, 8, 1) fn applyPhysics(
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>) {
        let id = global_invocation_index(workgroup_id, local_invocation_index, num_workgroups,
                                         8*8*1 /* CHANGE ME WHEN WORKGROUP SIZE CHANGES */);
        if(id >= arrayLength(&circlesOld)) {return;}

        var newMe = circlesNew[id]; // does this slow down making a copy?
        let oldMe = circlesOld[id];
        newMe.grabbed = select(0u, 1u, 
                                       (uniforms.pointerHeld > 0 && oldMe.grabbed>0) // grabbed if previously grabbed and not yet released
                                       || (uniforms.pointerPressed > 0&& length(oldMe.center - uniforms.pointerLoc) < oldMe.radius)); // grabbed if pressed on this frame

        let gravity = select(uniforms.gravity, vec2f(), newMe.grabbed > 0);// no gravity if grabbed
        newMe.velocity = oldMe.velocity + gravity;
        newMe.center = oldMe.center + newMe.velocity;

        // Todo: bucketing, momentum?
        for(var i = 0u; i < arrayLength(&circlesOld); i++) {
            if(i == id) {continue;}
            let delta = newMe.center - circlesOld[i].center;
            let dist = length(delta);
            // TODO: branchless
            let contactDist = newMe.radius + circlesOld[i].radius;
            let diff = contactDist - dist;
            if(diff > 0) {
                // TODO: uneven movement
                // TODO: If they are moving in the same direction, less velocity change! If moving in diff, more velocity change
                // Perhaps use dot product or somesuch?
                newMe.center += (delta * (diff/dist)) / 2;
                newMe.velocity += (delta * (diff/dist)) / 2;
            }
        }

        let pointerDelta = select(vec2f(), uniforms.pointerLoc - newMe.center, newMe.grabbed > 0);
        newMe.velocity += pointerDelta;
        newMe.center += pointerDelta;


        // TODO: move to uniforms
        let wall = 1.;
        let restitution = .3;

        let r = newMe.radius;
        let c = newMe.center;
        // TODO: branchless?
        if(c.x > wall - r) {
            newMe.center.x = wall - r;
            newMe.velocity.x *= -restitution;
        }
        if(c.x < -wall + r) {
            newMe.center.x = -wall + r;
            newMe.velocity.x *= -restitution;
        }
        if(c.y > wall - r) {
            newMe.center.y = wall - r;
            newMe.velocity.y *= -restitution;
        }
        if(c.y < -wall + r) {
            newMe.center.y = -wall + r;
            newMe.velocity.y *= -restitution;
        }
        
        //limit to max speed
        let maxSpeed = r*.5;
        let speed = length(newMe.velocity);
        newMe.velocity = select(newMe.velocity, newMe.velocity/speed * maxSpeed, speed > maxSpeed);

        //DEBUG
        // if(id == arrayLength(&circlesOld) -1) {
            //newMe.color = vec4f(1., 1., 1., 1.);
        // }

        circlesNew[id] = newMe;
    }
`;