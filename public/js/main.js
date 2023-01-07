import * as THREE from 'three'
import { PlaneBufferGeometry, SphereGeometry, Vector3 } from 'three';
import { EffectComposer } from './lib/EffectComposer.js';
import { RenderPass } from './lib/RenderPass.js';
import { UnrealBloomPass } from './lib/UnrealBloomPass.js';
import { GlitchPass } from './GlitchPass.js';
import { GLTFLoader } from './lib/GLTFLoader.js'
import { Reflector } from './lib/Reflector.js'

function isTouchDevice() {
    return (('ontouchstart' in window) ||
       (navigator.maxTouchPoints > 0) ||
       (navigator.msMaxTouchPoints > 0));
}

Ammo().then(function(Ammo){

    function criarConvexHullPhysicsShape(geometry) {
        var coords = geometry.attributes.position.array;
        var tempBtVec3_1 = new Ammo.btVector3(0, 0, 0);
        var shape = new Ammo.btConvexHullShape();
        for (var i = 0, il = coords.length; i < il; i+= 3) {
            tempBtVec3_1.setValue(coords[i], coords[i + 1], coords[i + 2]);
            var lastOne = (i >= (il - 3));
            shape.addPoint(tempBtVec3_1, lastOne);
        }
        return shape;
    }

    // init
    let player = null, player_sphere = null, player_rb = null;
    let ground = null;
    let token = null, token_y = 0;
    let other = null;
    let target = {x: 0, y:0, z: 0};
    var pressedKeys = {};
    let touch_upper = false;
    let touch_downer = false;

    // Init Bullet
    // init Bullet
    var collisionConfiguration  = new Ammo.btDefaultCollisionConfiguration(),
        dispatcher              = new Ammo.btCollisionDispatcher(collisionConfiguration),
        overlappingPairCache    = new Ammo.btDbvtBroadphase(),
        solver                  = new Ammo.btSequentialImpulseConstraintSolver(),
        dynamicsWorld           = new Ammo.btDiscreteDynamicsWorld(dispatcher, overlappingPairCache, solver, collisionConfiguration);
    dynamicsWorld.setGravity(new Ammo.btVector3(0, -10, 0));

    var groundShape     = new Ammo.btBoxShape(new Ammo.btVector3(50, 1, 50)),
        bodies          = [],
        groundTransform = new Ammo.btTransform();
    groundTransform.setIdentity();
    groundTransform.setOrigin(new Ammo.btVector3(0, -1.5, 0));
    
    // create ground RB
    (function() {
        var mass          = 0,
            isDynamic     = (mass !== 0),
            localInertia  = new Ammo.btVector3(0, 0, 0);
  
        if (isDynamic)
          groundShape.calculateLocalInertia(mass, localInertia);
  
        var myMotionState = new Ammo.btDefaultMotionState(groundTransform),
            rbInfo        = new Ammo.btRigidBodyConstructionInfo(mass, myMotionState, groundShape, localInertia),
            body          = new Ammo.btRigidBody(rbInfo);
  
        dynamicsWorld.addRigidBody(body);
        //bodies.push(body);
      })();

    const camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.01, 100 );
    camera.position.z = 6;
    camera.position.x = -3;
    camera.position.y = 8;
    camera.lookAt(new THREE.Vector3(0,0,0));

    const scene = new THREE.Scene();

    // ambient light
    const ambientLight = new THREE.AmbientLight( 0x808080 ); // soft white light
    scene.add( ambientLight );

    // Sun
    const light = new THREE.DirectionalLight( 0xffffff, 1 );
    light.position.set( 0, 1, 0 ); //default; light shining from top
    light.castShadow = true; // default false
    scene.add( light );

    //Set up shadow properties for the light
    light.shadow.mapSize.width = 512; // default
    light.shadow.mapSize.height = 512; // default
    light.shadow.camera.near = 0.5; // default
    light.shadow.camera.far = 500; // default

    // renderer and passes
    const renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor( 0x000000, 1 );
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = Math.pow( 1, 2.0 );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setAnimationLoop( animation );
    document.body.appendChild( renderer.domElement );

    const clock = new THREE.Clock();

    const renderScene = new RenderPass( scene, camera );

    const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85 );
    bloomPass.threshold = 0;
    bloomPass.strength = 1.5;
    bloomPass.radius = 0;

    const composer = new EffectComposer( renderer );
    composer.addPass( renderScene );

    const glitchPass = new GlitchPass();
    composer.addPass( glitchPass );

    composer.addPass( bloomPass );

    window.addEventListener( 'resize', onWindowResize, false );
    window.onkeyup = function(e) { pressedKeys[e.keyCode] = false; }
    window.onkeydown = function(e) { pressedKeys[e.keyCode] = true; }
    window.addEventListener('touchstart', function(e) {
        if (e.touches[0].clientY <= this.window.innerHeight / 2. ){
            touch_upper = true;
        } else {
            touch_downer = true;
        }
    });
    window.addEventListener('touchend', function(e) {
        touch_upper = false;
        touch_downer = false;
    });

    const mirrorBack1 = new Reflector(
        new THREE.PlaneGeometry(100, 100),
        {
            color: new THREE.Color(0x333333),
            textureWidth: window.innerWidth * window.devicePixelRatio,
            textureHeight: window.innerHeight * window.devicePixelRatio
        }
    )

    mirrorBack1.rotation.x = -Math.PI / 2;
    mirrorBack1.position.y = -.5;
    mirrorBack1.position.z = 0;
    mirrorBack1.position.x = 0;
    mirrorBack1.receiveShadow = false;
    scene.add(mirrorBack1);

    // Instantiate a loader
    const loader = new GLTFLoader();

    // Load a glTF resource
    loader.load(
        // resource URL
        'cube.gltf',
        // called when the resource is loaded
        function ( gltf ) {

            gltf.animations; // Array<THREE.AnimationClip>
            gltf.scene; // THREE.Group
            gltf.scenes; // Array<THREE.Group>
            gltf.cameras; // Array<THREE.Camera>
            gltf.asset; // Object

            console.log(gltf.scene);
            gltf.scene.children.forEach((obj) => {
                //console.log(obj);

                if (obj.name == "Ground"){
                    obj.castShadow = false; //default is false
                    obj.receiveShadow = true; //default

                    var mirrorMaterial = new THREE.MeshPhysicalMaterial({
                        transmission: 0.5,
                        roughness: 0.1,
                        clearcoat: 1.0,
                        clearcoatRoughness: 0.1
                    });
                    obj.visible = false;
                    obj.material = mirrorMaterial;

                } else if (obj.name == "Player"){
                    obj.castShadow = true; //default is false
                    obj.receiveShadow = true; //default

                    // var mirrorMaterial = new THREE.MeshPhysicalMaterial({
                    //     color: 0x031c16,
                    //     roughness: 0.2,
                    //     clearcoat: 1.0,
                    //     clearcoatRoughness: 0.1
                    // });
                    var mirrorMaterial = new THREE.MeshToonMaterial({
                        color: 0x031c16,
                    });
                    obj.material = mirrorMaterial;

                    player = obj;
                    target.x = player.position.x;
                    target.y = player.position.y;
                    target.z = player.position.z;

                    obj.geometry.computeBoundingSphere();
                    console.log(obj.geometry.boundingSphere);

                    // Player RB
                    (function() {
                        var colShape        = new Ammo.btSphereShape(obj.geometry.boundingSphere.radius),
                            startTransform  = new Ammo.btTransform();
                
                        startTransform.setIdentity();
                
                        var mass          = 1,
                            isDynamic     = (mass !== 0),
                            localInertia  = new Ammo.btVector3(0, 0, 0);
                
                        if (isDynamic)
                            colShape.calculateLocalInertia(mass,localInertia);
                
                        startTransform.setOrigin(new Ammo.btVector3(0, 1, 0));
                
                        var myMotionState = new Ammo.btDefaultMotionState(startTransform),
                            rbInfo        = new Ammo.btRigidBodyConstructionInfo(mass, myMotionState, colShape, localInertia),
                            body          = new Ammo.btRigidBody(rbInfo);
                
                        dynamicsWorld.addRigidBody(body);
                        //bodies.push(body);
                        player_rb = body;
                    })();

                } else if (obj.name == "Token"){
                    obj.castShadow = true; //default is false
                    obj.receiveShadow = true; //default

                    var mirrorMaterial = new THREE.MeshPhysicalMaterial({
                        color: 0xa1fc03,
                        roughness: 0.2,
                        clearcoat: 1.0,
                        clearcoatRoughness: 0.1
                    });
                    obj.material = mirrorMaterial;
                    token = obj;
                    token_y = token.position.y;

                } else if (obj.name.includes("Lamp")){
                    obj.castShadow = true; //default is false
                    obj.receiveShadow = true; //default

                    var mirrorMaterial = new THREE.MeshPhysicalMaterial({
                        color: 0x82347a
                    });
                    obj.material = mirrorMaterial;

                } else {
                    obj.castShadow = true; //default is false
                    obj.receiveShadow = true; //default

                    // var mirrorMaterial = new THREE.MeshPhysicalMaterial({
                    //     color: 0x222222,
                    //     roughness: 0.2,
                    //     clearcoat: 1.0,
                    //     clearcoatRoughness: 0.1
                    // });
                    var mirrorMaterial = new THREE.MeshToonMaterial({
                             color: 0x111111
                         });
                    obj.material = mirrorMaterial;

                    obj.geometry.computeBoundingBox();
                    let boundingBox = new THREE.Box3();
                    boundingBox.setFromObject(obj);

                    const matrix = new THREE.Matrix4().setPosition(
                        new THREE.Vector3().addVectors(boundingBox.min, boundingBox.max).multiplyScalar(0.5)
                    );
                    const boxDummyPosition = new THREE.Vector3();
                    boxDummyPosition.setFromMatrixPosition( matrix );

                    // RB
                    (function() {
                        var colShape        = criarConvexHullPhysicsShape(obj.geometry),
                            startTransform  = new Ammo.btTransform();
                
                        startTransform.setIdentity();
                
                        var mass          = 0,
                            isDynamic     = (mass !== 0),
                            localInertia  = new Ammo.btVector3(0, 0, 0);
                
                        if (isDynamic)
                            colShape.calculateLocalInertia(mass,localInertia);
                
                         startTransform.setOrigin(new Ammo.btVector3(boxDummyPosition.x, 
                             boxDummyPosition.y, 
                             boxDummyPosition.z));
                
                        var myMotionState = new Ammo.btDefaultMotionState(startTransform),
                            rbInfo        = new Ammo.btRigidBodyConstructionInfo(mass, myMotionState, colShape, localInertia),
                            body          = new Ammo.btRigidBody(rbInfo);
                        
                        body.userData = {};
                        body.userData.mesh = obj;
                        dynamicsWorld.addRigidBody(body);
                        bodies.push(body);
                    })();
                }
            });

            scene.add( gltf.scene );

        },
        // called while loading is progressing
        function ( xhr ) {
            console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
        },
        // called when loading has errors
        function ( error ) {
            console.log( 'An error happened' );
        }
    );
    // end

      var trans = new Ammo.btTransform();
      var force_forward = new Ammo.btVector3( 0.0, 0.0, -0.5 );
      var force_backward = new Ammo.btVector3( 0.0, 0.0, 0.5 );
      var force_left = new Ammo.btVector3( 0.5, 0.0, 0.0 );
      var force_right = new Ammo.btVector3( -0.5, 0.0, 0.0 );
      var no_velocity = new Ammo.btVector3( 0, 0, 0 );


    function animation( time ) {
        let delta = clock.getDelta();

        if (dynamicsWorld){
            dynamicsWorld.stepSimulation(delta, 10);

            if (player_rb && player_rb.getMotionState()) {
                player_rb.getMotionState().getWorldTransform(trans);
                //console.log("world pos = " + [trans.getOrigin().x().toFixed(2), trans.getOrigin().y().toFixed(2), trans.getOrigin().z().toFixed(2)]);

                let p = trans.getOrigin();
                let q = trans.getRotation();
                if (player){
                    player.position.set( p.x(), p.y(), p.z() );
                    player.quaternion.set( q.x(), q.y(), q.z(), q.w() );
                }
            }

            for (let i = 0; i < bodies.length; i++){
                let body_p = bodies[i];

                if (body_p && body_p.getMotionState()) {
                    body_p.getMotionState().getWorldTransform(trans);
                    //console.log("world pos = " + [trans.getOrigin().x().toFixed(2), trans.getOrigin().y().toFixed(2), trans.getOrigin().z().toFixed(2)]);
    
                    let p = trans.getOrigin();
                    let q = trans.getRotation();
                    if (body_p.userData.mesh){
                        body_p.userData.mesh.position.set( p.x(), p.y(), p.z() );
                        body_p.userData.mesh.quaternion.set( q.x(), q.y(), q.z(), q.w() );
                    }
                }
            }
        }

        if (player != null){
            //player.rotation.x = time / 2000;
            //player.rotation.y = time / 1000;

            //camera.position.z = player.rotation.z + 6;
            //camera.position.x = player.rotation.x + -3;
            //camera.position.y = player.rotation.y + 8;

            camera.position.set( player.position.x + -3, player.position.y + 8, player.position.z + 6 );
            //camera.position.set( player.position.x + -1, player.position.y + 1, player.position.z + 6 );
            camera.lookAt(player.position);
            camera.updateMatrix();

            // 1.7320499128373052
        }
        if (token != null){
            token.position.y = token_y - (Math.sin(time * 0.01) * 0.1);
        }

        let speed = 0.2;
        let force = 2;
        let is_moving = false;
        if (pressedKeys[87] || touch_upper){
            //player.position.z -= speed;
            target.z -= speed;
            player_rb.activate(true);
            player_rb.applyCentralImpulse( force_forward );
            //player_rb.setLinearVelocity(force_forward);
            is_moving = true;
        }
        if (pressedKeys[83] || touch_downer){
            //player.position.z += speed;
            target.z += speed;
            player_rb.activate(true);
            player_rb.applyCentralImpulse( force_backward );
            //player_rb.setLinearVelocity(force_backward);
            is_moving = true;
        }
        if (pressedKeys[65]){
            //player.position.x -= speed;
            target.x -= speed;
            player_rb.activate(true);
            player_rb.applyCentralImpulse( force_right );
            //player_rb.setLinearVelocity(force_right);
            is_moving = true;
        }
        if (pressedKeys[68]){
            //player.position.x += speed;
            target.x += speed;
            player_rb.activate(true);
            player_rb.applyCentralImpulse( force_left );
            //player_rb.setLinearVelocity(force_left);
            is_moving = true;
        }
        //follow_target(target, player);

        //renderer.render( scene, camera );
        composer.render();
    }

    function onWindowResize(){
        const width = window.innerWidth;
        const height = window.innerHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize( width, height );
        composer.setSize( width, height );
    }

    function follow_target(target, player){
        if (player){
            let lerpX = (target.x - player.position.x) * 0.2;
            let lerpZ = (target.z - player.position.z) * 0.2;
            let lerpY = (target.y - player.position.y);

            player.position.x += lerpX;
            player.position.y += lerpY;
            player.position.z += lerpZ;
        }
    }

});