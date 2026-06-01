let traceSoName = 'libGumTrace.dylib'
let targetSo = 'AwemeCore'

let gumtrace_init = null
let gumtrace_run = null
let gumtrace_unrun = null

function loadGumTrace() {
    let dlopen = new NativeFunction(Module.findExportByName(null, 'dlopen'), 'pointer', ['pointer', 'int'])
    let dlsym = new NativeFunction(Module.findExportByName(null, 'dlsym'), 'pointer', ['pointer', 'pointer'])

    let soHandle = dlopen(Memory.allocUtf8String('/var/jb/var/root/' + traceSoName), 2)
    if (soHandle.isNull()) {
        let dlerror = new NativeFunction(Module.findExportByName(null, 'dlerror'), 'pointer', [])
        console.log('dlopen failed:', dlerror().readUtf8String())
        return false
    }
    console.log('GumTrace loaded:', soHandle)

    gumtrace_init = new NativeFunction(dlsym(soHandle, Memory.allocUtf8String('init')), 'void', ['pointer', 'pointer', 'int', 'pointer'])
    gumtrace_run = new NativeFunction(dlsym(soHandle, Memory.allocUtf8String('run')), 'void', [])
    gumtrace_unrun = new NativeFunction(dlsym(soHandle, Memory.allocUtf8String('unrun')), 'void', [])
    return true
}

function getSandboxPath(filename) {
    try {
        const homePath = ObjC.classes.NSString.stringWithString_("~").stringByExpandingTildeInPath().toString();
        return homePath + '/Documents/' + filename;
    } catch (e) {
        return '/tmp/' + filename
    }
}

// 找到主线程 ID（AwemeCore 的 UI 线程）
function getMainThreadId() {
    let threads = Process.enumerateThreads()
    for (let t of threads) {
        // 主线程 ID 通常等于进程 ID
        if (t.id === Process.id) return t.id
    }
    // fallback: 第一个线程
    return threads[0].id
}

setImmediate(function() {
    if (!loadGumTrace()) return

    let mainTid = getMainThreadId()
    console.log('main thread id:', mainTid, 'process id:', Process.id)

    let moduleNames = Memory.allocUtf8String(targetSo)
    let outputPath = Memory.allocUtf8String(getSandboxPath('trace.log'))
    let options = Memory.alloc(8)
    options.writeU64(1) // DEBUG 模式

    console.log('calling init with main thread...')
    gumtrace_init(moduleNames, outputPath, mainTid, options)
    console.log('init done')

    console.log('calling run...')
    gumtrace_run()
    console.log('run done, tracing main thread for 5 seconds...')

    setTimeout(function() {
        console.log('stopping trace...')
        gumtrace_unrun()
        console.log('done, check trace.log')
    }, 5000)
})
