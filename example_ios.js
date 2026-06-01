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
        let dlerror = new NativeFunction(Module.findExportByName(null, 'dlerror'), 'pointer', [])
        console.log('dlopen failed:', dlerror().readUtf8String())
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
    options.writeU64(1)  // DEBUG 模式

    console.log('calling init...')
    try {
        gumtrace_init(moduleNames, outputPath, threadId, options)
        console.log('init done')
    } catch(e) {
        console.log('init error:', e)
        return
    }

    console.log('calling run...')
    try {
        gumtrace_run()
        console.log('run done - tracing active for 3 seconds...')
    } catch(e) {
        console.log('run error:', e)
    }
}

function stopTrace() {
    console.log('calling unrun...')
    try {
        if (gumtrace_unrun) {
            gumtrace_unrun()
            console.log('unrun done')
        }
    } catch(e) {
        console.log('unrun error:', e)
    }
}

// 直接启动 trace，不依赖 hook
// trace 3 秒后自动停止
setImmediate(function() {
    console.log('=== starting trace ===')
    startTrace()

    setTimeout(function() {
        console.log('=== stopping trace after 3s ===')
        stopTrace()
        console.log('=== done ===')
    }, 3000)
})
