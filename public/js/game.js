import * as THREE from '/three';
//import { PlaneBufferGeometry, SphereGeometry, Vector3 } from '/three';
import { EffectComposer } from './lib/EffectComposer.js';
import { RenderPass } from './lib/RenderPass.js';
import { UnrealBloomPass } from './lib/UnrealBloomPass.js';
import { GlitchPass } from './GlitchPass.js';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { FontLoader } from './lib/FontLoader.js';
import { TextGeometry } from './lib/TextGeometry.js';
import { Reflector } from './lib/Reflector.js';

class Physics {
    constructor(Ammo){
        this.STATIC_MASS = 0;
        this.MAX_SUBSTEPS = 10;
        this.COLLISION_GROUP_1 = 1;
        this.COLLISION_GROUP_2 = 2;

        this.Ammo = Ammo;
        this.transform_placeholder = new Ammo.btTransform(); // used to retrieve rigid body transform during step. No sence in allocating during the step function
        this.shapes_memo = {}; // Many convex hull shapes with the exact same geometry being created did not sit right with me. This is used as a mapping from coord hash to Shape.

        // Init Ammo
        this.collisionConfiguration  = new Ammo.btDefaultCollisionConfiguration();
        this.dispatcher              = new Ammo.btCollisionDispatcher(this.collisionConfiguration);
        this.overlappingPairCache    = new Ammo.btDbvtBroadphase();
        this.solver                  = new Ammo.btSequentialImpulseConstraintSolver();
        this.dynamicsWorld           = new Ammo.btDiscreteDynamicsWorld(this.dispatcher, this.overlappingPairCache, this.solver, this.collisionConfiguration);
        this.groundPlane = null;
        this.dynamic_bodies = [];

        // Set Contact pair Result
        this.cbContactPairResult = new Ammo.ConcreteContactResultCallback();
        this.cbContactPairResult.hasContact = false;
        this.cbContactPairResult.addSingleResult = function(cp, colObj0Wrap, partId0, index0, colObj1Wrap, partId1, index1){
            const contactPoint = Ammo.wrapPointer(cp, Ammo.btManifoldPoint);
            if (contactPoint.getDistance() > 0) return;
            this.hasContact = true;
        }

        // Init Physical World
        this.dynamicsWorld.setGravity(new Ammo.btVector3(0, -20, 0));

        // Init Ground Plane
        this.groundPlane = this.createGroundPlane();
    }

    contactTest(bodyA, bodyB){
        let result = false;
        this.dynamicsWorld.contactPairTest(bodyA, bodyB, this.cbContactPairResult);
        result = this.cbContactPairResult.hasContact;
        this.cbContactPairResult.hasContact = false;
        return result;
    }

    step(delta){
        this.dynamicsWorld.stepSimulation(delta, this.MAX_SUBSTEPS);

        for (let i = 0; i < this.dynamic_bodies.length; i++){
            let body_p = this.dynamic_bodies[i];
            body_p.is_touching = false;

            if (body_p.getMotionState()) {
                body_p.getMotionState().getWorldTransform(this.transform_placeholder);

                let p = this.transform_placeholder.getOrigin();
                let q = this.transform_placeholder.getRotation();
                if (body_p.userData && body_p.userData.mesh){ // check if RB has threejs Mesh attached to it in order to update its transform
                    body_p.userData.mesh.position.set( p.x(), p.y(), p.z() );
                    body_p.userData.mesh.quaternion.set( q.x(), q.y(), q.z(), q.w() );
                }
            }
        }

        let numManifolds = this.dispatcher.getNumManifolds();
        for (let i = 0; i < numManifolds; i++) {
            let manifold = this.dispatcher.getManifoldByIndexInternal(i);
            
            let obj1 = manifold.getBody0();
            let obj2 = manifold.getBody1();

            let rigidBody1 = Ammo.castObject(obj1, Ammo.btRigidBody);
            let rigidBody2 = Ammo.castObject(obj2, Ammo.btRigidBody);

            rigidBody1.is_touching = true;
            rigidBody2.is_touching = true;
        }
    }

    createGroundPlane(){
        let body = this.createBody(this.STATIC_MASS, 
                                new this.Ammo.btBoxShape(new Ammo.btVector3(50, 1, 50)),
                                {x: 0, y: -1.5, z: 0});
        return body;
    }

    createSphere(radius, position){
        let body = this.createBody(1, new this.Ammo.btSphereShape(radius), position);
        this.dynamic_bodies.push(body);
        return body;
    }

    createStaticMesh(geometry, position){
        let body = this.createBody(this.STATIC_MASS, this.convexHullShape_from_geometry(geometry), position);
        return body;
    }

    createStaticMesh_NoCollision(geometry, position){
        let body = this.createBody(this.STATIC_MASS, this.convexHullShape_from_geometry(geometry), position, true);
        return body;
    }

    createBody(mass, shape, position, shouldIgnoreCollision=false){
        let startTransform  = new this.Ammo.btTransform();
        startTransform.setIdentity();
        startTransform.setOrigin(new this.Ammo.btVector3(position.x, position.y, position.z));
    
        let isDynamic     = (mass !== 0),
            localInertia  = new this.Ammo.btVector3(0, 0, 0);
    
        if (isDynamic){
            shape.calculateLocalInertia(mass, localInertia);
        }
    
        let motionState = new this.Ammo.btDefaultMotionState(startTransform),
            rbInfo        = new this.Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia),
            body          = new this.Ammo.btRigidBody(rbInfo);
        
        if (shouldIgnoreCollision){
            this.dynamicsWorld.addRigidBody(body, this.COLLISION_GROUP_1, this.COLLISION_GROUP_2);

        } else {
            this.dynamicsWorld.addRigidBody(body, this.COLLISION_GROUP_1, this.COLLISION_GROUP_1);
        }
        return body;
    }

    convexHullShape_from_geometry(geometry) {
        let coords = geometry.attributes.position.array;
        let hash_of_coords = this.hashFloat32Array(coords);
        if (this.shapes_memo[hash_of_coords]){
            return this.shapes_memo[hash_of_coords];
        }
        
        let tempBtVec3_1 = new this.Ammo.btVector3();
        let shape = new this.Ammo.btConvexHullShape();
        for (let i = 0, il = coords.length; i < il; i+= 3) {
            tempBtVec3_1.setValue(coords[i], coords[i + 1], coords[i + 2]);
            let lastOne = (i >= (il - 3));
            shape.addPoint(tempBtVec3_1, lastOne);
        }

        this.shapes_memo[hash_of_coords] = shape;
        return shape;
    }

    hashFloat32Array(array){
        let string_representation = array.toString();
        let hash = 0, chr;
        if (string_representation.length === 0) return hash;
        for (let i = 0; i < string_representation.length; i++) {
            chr   = string_representation.charCodeAt(i);
            hash  = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }
}

class OtherPlayer {
    constructor(mesh){
        this.mesh = mesh;
        this.target_position = {x: 0, y: 0, z:0};
        this.target_rotation = {x: 0, y: 0, z:0, w:0};
    }
}

class Game {
    constructor(element, Ammo){
        let that = this;

        // Init Game Vars
        this.element = element;
        this.pressedKeys = {};
        this.touch_up = false;
        this.touch_down = false;
        this.touch_left = false;
        this.touch_right = false;
        this.physics = new Physics(Ammo);
        this.ws_client = null;
        this.scene_loaded = false;

        // Player vars
        this.force_forward = new Ammo.btVector3( 0.0, 0.0, -0.5 );
        this.force_backward = new Ammo.btVector3( 0.0, 0.0, 0.5 );
        this.force_left = new Ammo.btVector3( 0.5, 0.0, 0.0 );
        this.force_right = new Ammo.btVector3( -0.5, 0.0, 0.0 );
        this.no_velocity = new Ammo.btVector3( 0, 0, 0 );

        this.player_rb = null; // Will be loaded with the scene below (async)
        this.player_geometry = null;
        this.player_name = null;
        this.my_id = null;
        this.player_mapping = {};
        this.pads = [];
        this.state_update_interval = 100; // milliseconds this server will send game state updates to

        // Game Clock
        this.clock = new THREE.Clock();
        this.update_Clock = new THREE.Clock();

        // Init Scene
        this.scene = new THREE.Scene();

        // Init Game Camera
        this.camera = new THREE.PerspectiveCamera( 50, $(this.element).width() / $(this.element).height(), 0.01, 100 );
        this.camera.position.z = 6;
        this.camera.position.x = -3;
        this.camera.position.y = 8;
        this.camera.lookAt(new THREE.Vector3(0,0,0));

        // Init Scene Ambient Light
        const ambientLight = new THREE.AmbientLight( 0x808080 ); // soft white light
        this.scene.add( ambientLight );

        // Init Sun (Directional Light)
        this.light = new THREE.DirectionalLight( 0xffffff, 1 );
        this.light.position.set( 0, 10, 0 ); // light shining from top
        this.light.castShadow = true;
        // Setup shadow properties for the light
        this.light.shadow.mapSize.width = 2048;
        this.light.shadow.mapSize.height = 2048;
        this.light.shadow.camera.near = 0.5;
        this.light.shadow.camera.far = 500;
        this.light.shadow.camera.right = 50;
        this.light.shadow.camera.left = -50;
        this.light.shadow.camera.top = 50;
        this.light.shadow.camera.bottom = -50;
        this.light.shadow.camera.updateProjectionMatrix();
        this.scene.add( this.light );

        // Init Renderer
        this.renderer = new THREE.WebGLRenderer( { antialias: true } );
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.setClearColor( 0x090909, 1 );
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = Math.pow( 1, 2.0 );
        this.renderer.setSize( $(this.element).width(), $(this.element).height() );
        this.renderer.setAnimationLoop( (time) => {
            that.animation(time);
        });
        // Append Renderer to HTML Element
        $(this.element).append( this.renderer.domElement );

        // Init Render Passes
        this.composer = new EffectComposer( this.renderer );
        this.composer.addPass(new RenderPass( this.scene, this.camera ));
        //this.composer.addPass( new GlitchPass() );

        const bloomPass = new UnrealBloomPass( new THREE.Vector2( $(this.element).width(), $(this.element).height() ), 1.5, 0.4, 0.85 );
        bloomPass.threshold = 0;
        bloomPass.strength = 1.5;
        bloomPass.radius = 0;
        //this.composer.addPass( bloomPass );

        // Setup Ground Reflector
        this.groundMirror = new Reflector(
            new THREE.PlaneGeometry(100, 100),
            {
                color: new THREE.Color(0x333333),
                textureWidth: window.innerWidth * window.devicePixelRatio,
                textureHeight: window.innerHeight * window.devicePixelRatio
            }
        );
        this.groundMirror.rotation.x = -Math.PI / 2; // Rotate on X 90 degrees
        this.groundMirror.position.y = -.5;
        this.groundMirror.position.z = 0;
        this.groundMirror.position.x = 0;
        this.groundMirror.receiveShadow = false;
        //this.scene.add( this.groundMirror );

        // Window Events
        window.addEventListener( 'resize', () => that.onWindowResize(), false );
        window.onkeyup = (e) => that.onKeyUp(e);
        window.onkeydown = (e) => that.onKeyDown(e);
        window.addEventListener('touchstart', (e) => that.touchStart(e));
        window.addEventListener('touchend', (e) => that.touchEnd(e));

        this.last_pad_picked_time = this.clock.getElapsedTime();
        this.chosen_pad = null;
        this.player_has_touched_chosen_pad = false;
    }

    animation(time){
        let that = this;
        const delta = this.clock.getDelta();
        //console.log(delta);
        that.physics.step(delta);

        // Handle user input
        let player_can_be_controlled = (this.player_rb) ? this.player_rb.is_touching : false;
        if ((this.pressedKeys[87] || this.touch_up) && player_can_be_controlled){
            this.player_rb.activate(true);
            //this.player_rb.applyCentralImpulse( this.force_forward );
            this.player_rb.applyTorqueImpulse(new Ammo.btVector3(-20 * delta, 0, 0));
            //this.player_rb.userData.mesh.position.z += -10 * delta;
        }
        if ((this.pressedKeys[83] || this.touch_down) && player_can_be_controlled){
            this.player_rb.activate(true);
            //this.player_rb.applyCentralImpulse( this.force_backward );
            this.player_rb.applyTorqueImpulse(new Ammo.btVector3(20 * delta, 0, 0));
            //this.player_rb.userData.mesh.position.z += 10 * delta;
        }
        if ((this.pressedKeys[65] || this.touch_right) && player_can_be_controlled){
            this.player_rb.activate(true);
            //this.player_rb.applyCentralImpulse( this.force_right);
            this.player_rb.applyTorqueImpulse(new Ammo.btVector3(0, 0, 20 * delta));
        }
        if ((this.pressedKeys[68] || this.touch_left) && player_can_be_controlled){
            this.player_rb.activate(true);
            //this.player_rb.applyCentralImpulse( this.force_left );
            this.player_rb.applyTorqueImpulse(new Ammo.btVector3(0, 0, -20 * delta));
        }

        if (this.pressedKeys[32] && player_can_be_controlled){
            this.player_rb.setDamping(0.99, 0.99);

        } else if (this.player_rb) {
            this.player_rb.setDamping(0, 0);

            if (!player_can_be_controlled){
                this.player_rb.setAngularVelocity(new Ammo.btVector3(0, 0, 0));
            }
        }

        // Camera follow player
        if (this.player_rb){
            let player = this.player_rb.userData.mesh;
            this.camera.position.set( player.position.x + -3, player.position.y + 8, player.position.z + 6 );
            this.camera.lookAt(player.position);
            this.camera.updateMatrix();

            // update player text
            if (this.player_name){
                this.player_name.position.set( player.position.x - 0.9, player.position.y + 1.5, player.position.z );
            }
        }

        // handle networking
        if (this.ws_client && this.player_rb){
            let player = this.player_rb.userData.mesh;

            let contactWithPad = false;
            this.pads.forEach((pad) => {
                if (that.physics.contactTest(pad.rbody, this.player_rb)){
                    contactWithPad = true;
                }
            });

            if (this.chosen_pad && that.physics.contactTest(that.chosen_pad.rbody, that.player_rb)){
                that.player_has_touched_chosen_pad = true;
            }

            if (that.player_has_touched_chosen_pad){
                player.material.color.setHex(0x00bb00);
            } else if (contactWithPad){
                player.material.color.setHex(0xff0000);
            } else {
                player.material.color.setHex(0x36151f);
            }

            if ((this.clock.getElapsedTime() - this.last_pad_picked_time) >= 5){
                console.log("new pick");
    
                if (this.chosen_pad){
                    this.chosen_pad.material.color.setHex(0x111312);
    
                    if (!this.player_has_touched_chosen_pad){
                        console.log("Lost Choice!");
                    }
                }
    
                this.chosen_pad = this.pads[Math.floor(Math.random() * this.pads.length)];
                this.chosen_pad.material.color.setHex(0xff0000);
                this.player_has_touched_chosen_pad = false;
    
                this.last_pad_picked_time = this.clock.getElapsedTime();
            }

            this.ws_client.send({
                type: "player_state_update",
                id: this.my_id,
                position: {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z
                },
                rotation: {
                    x: player.quaternion._x,
                    y: player.quaternion._y,
                    z: player.quaternion._z,
                    w: player.quaternion._w
                },
                radius: (this.player_geometry) ? this.player_geometry.boundingSphere.radius : 0
            });
        }

        this.interpolatePlayerPositions(delta);

        this.composer.render();
    }

    onKeyDown(e){
        this.pressedKeys[e.keyCode] = true;
    }

    onKeyUp(e){
        this.pressedKeys[e.keyCode] = false;
    }

    touchStart(e){
        let vert_quad_unit = window.innerHeight / 3;
        let horz_quad_unit = window.innerWidth / 3;

        if (e.touches[0].clientY > window.innerHeight - vert_quad_unit ){
            this.touch_down = true;

        } else if (e.touches[0].clientY < vert_quad_unit) {
            this.touch_up = true;
        }

        if (e.touches[0].clientX > window.innerWidth - horz_quad_unit ){
            this.touch_left = true;

        } else if (e.touches[0].clientX < horz_quad_unit) {
            this.touch_right = true;
        }
    }

    setWSClient(ws_client){
        this.ws_client = ws_client;
    }

    setMyId(id){
        this.my_id = id;
    }

    touchEnd(e){
        this.touch_up = false;
        this.touch_down = false;
        this.touch_left = false;
        this.touch_right = false;
    }

    onWindowResize(){
        const width = $(this.element).width();
        const height = $(this.element).height();
    
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    
        this.renderer.setSize( width, height );
        this.composer.setSize( width, height );
    }

    loadScene(asset_location){
        // Init Loader Constants
        const PLAYER_Prefix = "Player";
        const GROUND_Prefix = "Ground";
        const LAMP_Prefix = "Lamp";
        const STATIC_Prefix = "Other";

        let remove_objects = [];
        let that = this;
        const loader = new GLTFLoader();
        loader.load(asset_location, function( gltf ){
                gltf.scene.children.forEach((obj) => {
                    let shouldKeepObj = true;
                    if (obj.name.startsWith(GROUND_Prefix)){
                        shouldKeepObj = that.handle_loadGround(obj);
    
                    } else if (obj.name.startsWith(PLAYER_Prefix)){
                        shouldKeepObj = that.handle_loadPlayer(obj);
    
                    } else if (obj.name.startsWith(STATIC_Prefix)) {
                        shouldKeepObj = that.handle_loadStatic(obj);

                    } else if (obj.name.startsWith(LAMP_Prefix)){
                        shouldKeepObj = that.handle_loadLamp(obj);

                    } else if (obj.name.startsWith("Pad")){
                        shouldKeepObj = that.handle_loadPad(obj);

                    } else {
                        shouldKeepObj = false;
                    }

                    if (!shouldKeepObj){
                        remove_objects.push(obj.name);
                    }
                });

                // Remove Objects that are not needed
                remove_objects.forEach((name) => {
                    gltf.scene.remove(gltf.scene.getObjectByName(name));
                });
    
                that.scene.add( gltf.scene );
                that.scene_loaded = true;
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
    }

    loadGameState(state){
        let that = this;
        if (this.scene_loaded){
            this.state_update_interval = state.state_update_interval;
            
            // reset player exists map
            for (const [id, otherPlayer] of Object.entries(this.player_mapping)) {
                otherPlayer.exists = false;
            }

            state.players.forEach((player) => {
                if (player.id !== this.my_id){ // Scene must be fully loaded AND player my not be this player
                    let otherPlayer = null;
                    if (this.player_mapping[player.id]){ // player exists
                        otherPlayer = this.player_mapping[player.id];
    
                    } else { // player doesn't exist
                        otherPlayer = new OtherPlayer(new THREE.Mesh(this.player_geometry, new THREE.MeshToonMaterial({
                            color: 0x171417,
                        })));
                        otherPlayer.mesh.castShadow = true;

                        const fontLoader = new FontLoader();
                        fontLoader.load('font/gentilis_bold.typeface.json', function (font) {
                            // Create text using the font
                            const textGeometry = new TextGeometry('Other 1', {
                                font: font,
                                size: 0.3,
                                height: 0.05,
                                curveSegments: 12,
                                bevelEnabled: false
                            });

                            const textMaterial = new THREE.MeshBasicMaterial({color: 0x303333});
                            const text = new THREE.Mesh(textGeometry, textMaterial);

                            otherPlayer.player_name = text;
                            that.scene.add(otherPlayer.player_name);

                            that.groundMirror.ignore_objects.push(text);
                        });

                        this.player_mapping[player.id] = otherPlayer;
                        this.scene.add(otherPlayer.mesh);
                        otherPlayer.target_position = player.position;
                        otherPlayer.target_rotation = player.rotation;
                        console.log("New Player joined");
                    }
                    
                    // Update last and current position
                    otherPlayer.current_position = otherPlayer.target_position;
                    otherPlayer.target_position = player.position;

                    // Update last and current rotation
                    otherPlayer.current_rotation = otherPlayer.target_rotation;
                    otherPlayer.target_rotation = player.rotation;

                    otherPlayer.last_time = this.clock.getElapsedTime();

                    otherPlayer.mesh.position.set(player.position.x, player.position.y, player.position.z);
                    otherPlayer.mesh.quaternion.set(player.rotation.x, player.rotation.y, player.rotation.z, player.rotation.w);

                    otherPlayer.exists = true;

                    if (player.is_touching){
                        otherPlayer.mesh.material.color.setHex(0xff0000);

                    } else {
                        otherPlayer.mesh.material.color.setHex(0x171417);
                    }
                }
            });

            // cleanup players that do not exist anymore
            for (const [id, otherPlayer] of Object.entries(this.player_mapping)) {
                if (!otherPlayer.exists){
                    this.scene.remove(otherPlayer.mesh);
                    this.scene.remove(otherPlayer.player_name);
                    delete this.player_mapping[id];
                    console.log(`Deleted Player: len: ${Object.entries(this.player_mapping).length}`);
                }
            }
        }
    }

    interpolatePlayerPositions(delta){
        if (this.scene_loaded){
            for (const [id, otherPlayer] of Object.entries(this.player_mapping)) {

                function calc_lerp(currentPosition, targetPosition, interpolationFactor){
                    return currentPosition + (targetPosition - currentPosition) * interpolationFactor;
                }

                function smooth_interp_factor(smoothingFactor, elapsed, state_update_interval){
                    let updateInterval = state_update_interval / 1000. // convert to seconds
                    let interpolation_factor = elapsed / updateInterval;
                    return interpolation_factor * smoothingFactor + (1 - smoothingFactor) * interpolation_factor;
                }

                let elapsed = this.clock.getElapsedTime() - otherPlayer.last_time;
                let smoothing_factor = 0.5;
                let interpolation_factor = smooth_interp_factor(smoothing_factor, elapsed, this.state_update_interval);

                // calc position interpolation
                let lerp_x = calc_lerp(otherPlayer.current_position.x, otherPlayer.target_position.x, interpolation_factor);
                let lerp_y = calc_lerp(otherPlayer.current_position.y, otherPlayer.target_position.y, interpolation_factor);
                let lerp_z = calc_lerp(otherPlayer.current_position.z, otherPlayer.target_position.z, interpolation_factor);

                otherPlayer.mesh.position.set( lerp_x, lerp_y, lerp_z );
                otherPlayer.mesh.quaternion.slerp(new THREE.Quaternion(otherPlayer.target_rotation.x, otherPlayer.target_rotation.y, otherPlayer.target_rotation.z, otherPlayer.target_rotation.w), interpolation_factor);

                // update player text
                if (otherPlayer.player_name){
                    otherPlayer.player_name.position.set( otherPlayer.mesh.position.x - 0.9, otherPlayer.mesh.position.y + 1.5, otherPlayer.mesh.position.z );
                }
            }
        }
    }

    handle_loadGround(obj){
        return false;
    }

    handle_loadPlayer(obj){
        let that = this;
        obj.castShadow = true;
        obj.receiveShadow = true;
        // obj.material = new THREE.MeshToonMaterial({
        //     color: 0x031c16,
        // });
        obj.material = new THREE.MeshToonMaterial({
             color: 0x36151f,
        });

        obj.geometry.computeBoundingSphere();
        console.log(`Sphere Radius: ${obj.geometry.boundingSphere.radius}`);
        let rbody = this.physics.createSphere(obj.geometry.boundingSphere.radius, obj.position);
        rbody.setFriction(4.0);
        rbody.userData = {mesh: obj};
        this.player_rb = rbody;
        this.player_geometry = obj.geometry;

        const fontLoader = new FontLoader();
        fontLoader.load('font/optimer_bold.typeface.json', function (font) {
            // Create text using the font
            const textGeometry = new TextGeometry('Player 1', {
                font: font,
                size: 0.3,
                height: 0.05,
                curveSegments: 12,
                bevelEnabled: false
              });

              const textMaterial = new THREE.MeshBasicMaterial({color: 0x303333});
              const text = new THREE.Mesh(textGeometry, textMaterial);

              that.player_name = text;
              that.scene.add(that.player_name);

              that.groundMirror.ignore_objects.push(text);
        });

        return true;
    }

    handle_loadLamp(obj){
        obj.castShadow = false;
        obj.receiveShadow = false;
        obj.material = new THREE.MeshPhysicalMaterial({
            color: 0x82347a
        });
        return true;
    }

    handle_loadStatic(obj){
        obj.castShadow = true;
        obj.receiveShadow = true;
        obj.material = new THREE.MeshToonMaterial({
            color: 0x111111
        });
        this.physics.createStaticMesh(obj.geometry, obj.position);
        return true;
    }

    handle_loadPad(obj){
        obj.castShadow = false;
        obj.receiveShadow = true;
        obj.material = new THREE.MeshToonMaterial({
            color: 0x111312
        });
        let rbody = this.physics.createStaticMesh_NoCollision(obj.geometry, obj.position);
        obj.rbody = rbody;
        this.pads.push(obj);
        return true;
    }
}

// Entry Point
$(document).ready(() => {
    Ammo().then((Ammo) => {
        const game = new Game($("#game_panel"), Ammo);

        const ws_client = new WSClient(() => {
            // On Open
            game.setWSClient(ws_client);
        },
        (message) => {
            // On Message
            switch (message.type){
                case "new_game":
                    game.loadScene(message.level);
                    game.setMyId(message.id);
                    break;
                case "game_state_update":
                    game.loadGameState(message);
                    break;
                default:
                    break;
            }
        },
        () => {
            // On Close
        });
    });
});