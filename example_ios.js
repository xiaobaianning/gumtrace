let traceSoName = 'libGumTrace.dylib'
let targetSo = 'AwemeCore'

let gumtrace_init = null
let gumtrace_run = null
let gumtrace_unrun = null
let isTracing = false
let stopTimer = null

function loadGumTrace() {
    let dlopen = new NativeFunction(Module.findExportByName(null, 'dlopen'), 'pointer', ['pointer', 'int'])
    let dlsym = new NativeFunction(Module.findExportByName(null, 'dlsym'), 'pointer', ['pointer', 'pointer'])

    let soHandle = dlopen(Memory.allocUtf8String('/var/jb/var/root/' + traceSoName), 2)
    if (soHandle.isNull()) return false
    console.log('GumTrace loaded:', soHandle)

    gumtrace_init = new NativeFunction(dlsym(soHandle, Memory.allocUtf8String('init')), 'void', ['pointer', 'pointer', 'int', 'pointer'])
    gumtrace_run = new NativeFunction(dlsym(soHandle, Memory.allocUtf8String('run')), 'void', [])
    gumtrace_unrun = new NativeFunction(dlsym(soHandle, Memory.allocUtf8String('unrun')), 'void', [])
    return true
}

function getSandboxPath(filename) {
    try {
        const homePath = ObjC.classes.NSString.stringWithString_("~").stringByExpandingTildeInPath().toString();
        return homePath + '/Documents/' + filename
    } catch (e) {
        return '/tmp/' + filename
    }
}

function startTrace() {
    if (isTracing) return
    isTracing = true

    let moduleNames = Memory.allocUtf8String(targetSo)
    let outputPath = Memory.allocUtf8String(getSandboxPath('trace.log'))
    let options = Memory.alloc(8)
    options.writeU64(2) // Stable 模式，trust_threshold=2

    // 找主线程 ID
    let threads = Process.enumerateThreads()
    let mainTid = Process.id // 主线程 ID == 进程 ID
    for (let t of threads) {
        if (t.id === Process.id) { mainTid = t.id; break }
    }
    console.log('tracing main thread:', mainTid)

    gumtrace_init(moduleNames, outputPath, mainTid, options)
    gumtrace_run()

    // 3 秒后自动停止
    stopTimer = setTimeout(function() {
        if (isTracing) {
            isTracing = false
            gumtrace_unrun()
            console.log('trace stopped')
        }
    }, 3000)
}

setImmediate(function() {
    if (!loadGumTrace()) return

    let targetModule = Process.findModuleByName(targetSo)
    console.log('target:', targetModule.name, 'base:', targetModule.base)

    // 直接启动 trace，跟踪主线程
    startTrace()
    console.log('tracing for 3 seconds...')
})
