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
    options.writeU64(1)

    gumtrace_init(moduleNames, outputPath, 0, options)
    gumtrace_run()
    console.log('trace started on thread', Process.getCurrentThreadId())

    // 3 秒后自动停止
    stopTimer = setTimeout(function() {
        if (isTracing) {
            isTracing = false
            gumtrace_unrun()
            console.log('trace stopped (timeout)')
        }
    }, 3000)
}

setImmediate(function() {
    if (!loadGumTrace()) return

    let targetModule = Process.findModuleByName(targetSo)
    console.log('target:', targetModule.name, 'base:', targetModule.base)

    // hook 函数，onEnter 启动 trace，不在 onLeave 停止
    Interceptor.attach(targetModule.base.add(0xD79A748), {
        onEnter(args) {
            if (!isTracing) {
                startTrace()
            }
        }
        // 不在 onLeave 停止，让 Stalker 持续跟踪 3 秒
    })

    console.log('hook installed, waiting...')
})
