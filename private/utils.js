
exports.distance = function(positionA, positionB){
    let x = positionA.x - positionB.x;
    let y = positionA.y - positionB.y;
    let z = positionA.z - positionB.z;
    return Math.sqrt( (x*x) + (y*y) + (z*z) );
}