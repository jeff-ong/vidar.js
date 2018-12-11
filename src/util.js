/**
 * Merges `options` with `defaultOptions`, and then copies the properties with the keys in `defaultOptions`
 *  from the merged object to `destObj`.
 *
 * @return {undefined}
 */
export function applyOptions(options, destObj, callingClass) {
    let superclass = Object.getPrototypeOf(destObj) !== callingClass.prototype;
    if (superclass) return;   // recursively combine default options in the lowermost child run,
                              // and ignore superclasses
    let defaultOptions = getDefaultOptions(callingClass);

    // validate; make sure `keys` doesn't have any extraneous items
    for (let option in options) {
        if (!defaultOptions.hasOwnProperty(option)) throw "Invalid option: '" + option + "'";
    }

    // merge options and defaultOptions
    options = {...defaultOptions, ...options};

    // copy options
    for (let option in options) {
        destObj[option] = options[option];
    }
}

// breadth-first binary tree traversal (https://stackoverflow.com/a/33704700/3783155)
function getDefaultOptions(clazz) {
    let queue = [clazz], currClass;
    let defaultOptions = {};

    while(queue.length) {
        currClass = queue.shift();
        // perform action (merging default options)
        // children classes have higher priority than (overwrite values from) parent classes so put them after
        defaultOptions = {...defaultOptions, ...currClass.defaultOptions};
        for (let i=0; i<currClass.inheritedDefaultOptions.length; i++)
            queue.push(currClass.inheritedDefaultOptions[i]);
    }
    return defaultOptions;
}

/**
 * @return {boolean} <code>true</code> if <code>property</code> is a non-array object and all of its own
 *  property keys are numbers or <code>"interpolate"</code> or <code>"interpolationKeys"</code>, and
 * <code>false</code>  otherwise.
 */
function isKeyFrames(property) {
    if ((typeof property !== "object" || property === null) || Array.isArray(property)) return false;
    // is reduce slow? I think it is
    let keys = Object.keys(property);   // own propeties
    for (let i=0; i<keys.length; i++) {
        let key = keys[i];
        // convert key to number, because object keys are always converted to strings
        if (+key === NaN && !(key === "interpolate" || key === "interpolationKeys"))
            return false;
    }
    return true;
}

/**
 * Calculates the value of keyframe set <code>property</code> at <code>time</code> if
 * <code>property</code> is an array, or returns <code>property</code>, assuming that it's a number.
 *
 * @param {(*|object)} property - value or map of time-to-value pairs for keyframes
 * @param {function} [property.interpolate=linearInterp] - the function to interpolate between keyframes
 * @param {string[]} [property.interpolationKeys] - keys to interpolate for objects
 * @param {number} [time] - time to calculate keyframes for, if necessary
 *
 * Note that only values used in keyframes that numbers or objects (including arrays) are interpolated.
 * All other values are taken sequentially with no interpolation. JavaScript will convert parsed colors,
 * if created correctly, to their string representations when assigned to a CanvasRenderingContext2D property
 * (I'm pretty sure).
 */
// TODO: is this function efficient??
// TODO: update doc @params to allow for keyframes
export function val(property, element, time) {
    if (isKeyFrames(property)) {
        // if (Object.keys(property).length === 0) throw "Empty key frame set"; // this will never be executed
        if (time == undefined) throw "|time| is undefined or null";
        // I think .reduce and such are slow to do per-frame (or more)?
        // lower is the max beneath time, upper is the min above time
        let lowerTime = 0, upperTime = Infinity,
            lowerValue = null, upperValue = null;    // default values for the inequalities
        for (let keyTime in property) {
            let keyValue = property[keyTime];
            keyTime = +keyTime; // valueOf to convert to number

            if (lowerTime <= keyTime && keyTime <= time) {
                lowerValue = keyValue;
                lowerTime = keyTime;
            }
            if (time <= keyTime && keyTime <= upperTime) {
                upperValue = keyValue;
                upperTime = keyTime;
            }
        }
        // TODO: support custom interpolation for 'other' types
        if (lowerValue === null) throw `No keyframes located before or at time ${time}.`;
        // no need for upperValue if it is flat interpolation
        if (!(typeof lowerValue === "number" || typeof lowerValue === "object")) return lowerValue;

        if (upperValue === null) throw `No keyframes located after or at time ${time}.`;
        if (typeof lowerValue !== typeof upperValue) throw "Type mismatch in keyframe values";

        // interpolate
        // the following should mean that there is a key frame *at* |time|; prevents division by zero below
        if (upperTime === lowerTime) return upperValue;
        let progress = time - lowerTime, percentProgress = progress / (upperTime - lowerTime);
        const interpolate = property.interpolate || linearInterp;
        return interpolate(lowerValue, upperValue, percentProgress, property.interpolationKeys);
    } else if (typeof property == "function") {
        return property(element, time);  // TODO? add more args
    } else {
        return property; // "primitive" value
    }
}

/*export function floorInterp(x1, x2, t, objectKeys) {
    // https://stackoverflow.com/a/25835337/3783155 (TODO: preserve getters/setters, etc?)
    return !objectKeys ? x1 : objectKeys.reduce((a, x) => {
        if (x1.hasOwnProperty(x)) a[x] = o[x];  // ignore x2
        return a;
    }, Object.create(Object.getPrototypeOf(x1)));
}*/

export function linearInterp(x1, x2, t, objectKeys) {
    if (typeof x1 !== typeof x2) throw "Type mismatch";
    if (typeof x1 !== "number" && typeof x1 !== "object") return x1;    // flat interpolation (floor)
    if (typeof x1 === "object") { // to work with objects (including arrays)
        // TODO: make this code DRY
        if (Object.getPrototypeOf(x1) !== Object.getPrototypeOf(x2)) throw "Prototype mismatch";
        let int = Object.create(Object.getPrototypeOf(x1)); // preserve prototype of objects
        // only take the union of properties
        let keys = Object.keys(x1) || objectKeys;
        for (let i=0; i<keys.length; i++) {
            let key = keys[i];
            // (only take the union of properties)
            if (!x1.hasOwnProperty(key) || !x2.hasOwnProperty(key)) continue;
            int[key] = linearInterp(x1[key], x2[key], t);
        }
        return int;
    }
    return (1-t) * x1 + t * x2;
}
export function cosineInterp(x1, x2, t, objectKeys) {
    if (typeof x1 !== typeof x2) throw "Type mismatch";
    if (typeof x1 !== "number" && typeof x1 !== "object") return x1;    // flat interpolation (floor)
    if (typeof x1 === "object" && typeof x2 === "object") { // to work with objects (including arrays)
        if (Object.getPrototypeOf(x1) !== Object.getPrototypeOf(x2)) throw "Prototype mismatch";
        let int = Object.create(Object.getPrototypeOf(x1)); // preserve prototype of objects
        // only take the union of properties
        let keys = Object.keys(x1) || objectKeys;
        for (let i=0; i<keys.length; i++) {
            let key = keys[i];
            // (only take the union of properties)
            if (!x1.hasOwnProperty(key) || !x2.hasOwnProperty(key)) continue;
            int[key] = cosineInterp(x1[key], x2[key], t);
        }
        return int;
    }
    let cos = Math.cos(Math.PI / 2 * t);
    return cos * x1 + (1-cos) * x2;
}

export class Color {
    constructor(r, g, b, a=255) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }

    toString() {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
    }
}

// https://stackoverflow.com/a/19366389/3783155
function memoize(factory, ctx) {
    let cache = {};
    return key => {
        if (!(key in cache)) cache[key] = factory.call(ctx, key);
        return cache[key];
    };
}
/**
 * Converts a CSS color string to a <code>Color</code> object representation.
 * Mostly used in keyframes and image processing effects.
 * @param {string} str
 * @return {object} the parsed color
 */
export const parseColor = (function() {
    let canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    let ctx = canvas.getContext("2d");
    // TODO - find a better way to cope with the fact that invalid
    //        values of "col" are ignored
    return memoize(str => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = str;
        ctx.fillRect(0, 0, 1, 1);
        return new Color(...ctx.getImageData(0, 0, 1, 1).data);
    });
})();

export class Font {
    constructor(size, family, sizeUnit="px") {
        this.size = size;
        this.family = family;
        this.sizeUnit = sizeUnit;
    }

    toString() {
        return `${this.size}${this.sizeUnit} ${this.family}`;
    }
}

export function parseFont(str) {
    const split = str.split(" ");
    if (split.length !== 2) throw `Invalid font '${str}'`;
    const sizeWithUnit = split[0], family = split[1],
        size = parseFloat(sizeWithUnit), sizeUnit = sizeWithUnit.substring(size.toString().length);
    return new Font(size, family, sizeUnit);
}

/*
 * Attempts to solve the diamond inheritance problem using mixins
 * See {@link http://javascriptweblog.wordpress.com/2011/05/31/a-fresh-look-at-javascript-mixins/}<br>
 *
 * <strong>Note that the caller has to explicitly update the class value and as well as the class's property
 * <code>constructor</code> to its prototype's constructor.</strong><br>
 *
 * This throws an error when composing functions with return values; unless if the composed function is a
 * constructor, which is handled specially.
 *
 * Note that all properties must be functions for this to work as expected.
 *
 * If the destination and source have the methods with the same name (key), assign a new function
 * that calls both with the given arguments. The arguments list passed to each subfunction will be the
 * argument list that was called to the composite function.
 *
 * This function only works with functions, getters and setters.
 *
 * TODO: make a lot more robust
 * TODO: rethink my ways... this is evil
 */
/*export function extendProto(destination, source) {
    for (let name in source) {
        const extendMethod = (sourceDescriptor, which) => {
            let sourceFn = sourceDescriptor[which],
                origDestDescriptor = Object.getOwnPropertyDescriptor(destination, name),
                origDestFn = origDestDescriptor ? origDestDescriptor[which] : undefined;
            let destFn = !origDestFn ? sourceFn : function compositeMethod() {   // `function` or `()` ?
                try {
                    // |.apply()| because we're seperating the method from the object, so return the value
                    // of |this| back to the function
                    let r1 = origDestFn.apply(this, arguments),
                        r2 = sourceFn.apply(this, arguments);
                    if (r1 || r2) throw "Return value in composite method"; // null will slip by ig
                } catch (e) {
                    if (e.toString() === "TypeError: class constructors must be invoked with |new|") {
                        let inst = new origDestFn(...arguments);
                        sourceFn.apply(inst, arguments);
                        return inst;
                    } else throw e;
                }
            };

            let destDescriptor = {...sourceDescriptor}; // shallow clone
            destDescriptor[which] = destFn;
            Object.defineProperty(destination, name, destDescriptor);
        };

        let descriptor = Object.getOwnPropertyDescriptor(source, name);
        if (descriptor) {   // if hasOwnProperty
            if (descriptor.get) extendMethod(descriptor, 'get');
            if (descriptor.set) extendMethod(descriptor, 'set');
            if (descriptor.value) extendMethod(descriptor, 'value');
        }
    }
}*/

export class PubSub {
    /*_*/subscribe(type, callback) {   // should always be public
        let callbacks = this._callbacks || (this._callbacks = {});
        (this._callbacks[type] || (this._callbacks[type] = [])).push(callback);
    }
    _publish(type, event) {
        if (!this._callbacks || !this._callbacks[type]) return;
        for (let i=0,l=this._callbacks[type].length; i<l; i++)
            this._callbacks[type][i](event);
        return event;
    }
}
