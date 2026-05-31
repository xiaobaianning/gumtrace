let traceSoName = 'libGumTrace.dylib'
let targetSo = 'AwemeCore'

let gumtrace_init = null
let gumtrace_run = null
let gumtrace_unrun = null

function loadGumTrace() {
    let dlopen = new NativeFunction(Module.findExportByName(null, 'dlopen'), 'pointer', ['pointer', 'int'])
    let dlsym = new NativeFunction(Module.findExportByName(null, 'dlsym'), 'pointer', ['pointer', 'pointer'])

    let soHandle = dlopen(Memory.allocUtf8String('/var/jb/var/root/' + traceSoName), 2)
    console.log('GumTrace loaded:', soHandle)
    if (soHandle.isNull()) {
        let error = new NativeFunction(Module.findExportByName(null, 'dlerror'), 'pointer', [])
        console.log('dlopen failed, dlerror:', error().readUtf8String())
        return false
    }

    gumtrace_init = new NativeFunction(dlsym(soHandle, Memory.allocUtf8String('init')), 'void', ['pointer', 'pointer', 'int', 'pointer'])
    gumtrace_run = new NativeFunction(dlsym(soHandle, Memory.allocUtf8String('run')), 'void', [])
    gumtrace_unrun = new NativeFunction(dlsym(soHandle, Memory.allocUtf8String('unrun')), 'void', [])

    console.log('init:', gumtrace_init, 'run:', gumtrace_run, 'unrun:', gumtrace_unrun)
    return true
}


function getSandboxPath(filename) {
    try {
        const homePath = ObjC.classes.NSString.stringWithString_("~").stringByExpandingTildeInPath().toString();
        console.log('trace file:', homePath + '/Documents/' + filename);
        return homePath + '/Documents/' + filename;
    } catch (e) {
        console.log('获取沙盒路径失败:', e);
        return '/tmp/' + filename
    }
}

function startTrace() {
    if (!loadGumTrace()) {
        console.log('loadGumTrace failed!')
        return
    }

    let moduleNames = Memory.allocUtf8String(targetSo)
    let outputPath = Memory.allocUtf8String(getSandboxPath('trace.log'))
    let threadId = 0   // 0 = 当前线程
    let options = Memory.alloc(8)

    // 0 = Stand 模式
    // 1 = DEBUG 模式
    // 2 = Stable 模式
    options.writeU64(1)  // 临时切到 DEBUG 模式方便调试

    console.log('calling init...')
    try {
        gumtrace_init(moduleNames, outputPath, threadId, options)
        console.log('init done')
    } catch (e) {
        console.log('init failed:', e)
        return
    }

    console.log('calling run...')
    try {
        gumtrace_run()
        console.log('run done')
    } catch (e) {
        console.log('run failed:', e)
        return
    }
}

function stopTrace() {
    console.log('calling unrun...')
    try {
        if (gumtrace_unrun) {
            gumtrace_unrun()
            console.log('unrun done')
        }
    } catch (e) {
        console.log('unrun failed:', e)
    }
}

// Warning: All apis from Frida 17

let isTrace = false
function hook() {

    // 示例：hook 目标函数，在其执行期间进行追踪
    let targetModule = Process.findModuleByName(targetSo)
    console.log('targetModule:', targetModule.name, 'base:', targetModule.base, 'size:', targetModule.size)

    Interceptor.attach(targetModule.base.add(0xD79AC6C), {
        onEnter() {
            if (isTrace === false) {
                isTrace = true
                console.log('=== onEnter: starting trace ===')
                startTrace()
                this.tracing = true
                console.log('=== onEnter: trace started ===')
            }
        },
        onLeave() {
            if (this.tracing) {
                console.log('=== onLeave: stopping trace ===')
                stopTrace()
                console.log('=== onLeave: trace stopped ===')
            }
        }
    })

    console.log('hook installed at', targetModule.base.add(0xD79AC6C))
}

setImmediate(hook)
