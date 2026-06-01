let traceSoName = 'libGumTrace.dylib'
let targetSo = 'AwemeCore'

let gumtrace_init = null
let gumtrace_run = null
let gumtrace_unrun = null
let isTracing = false

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

function startTrace() {
    if (isTracing) return
    isTracing = true

    let moduleNames = Memory.allocUtf8String(targetSo)
    let outputPath = Memory.allocUtf8String(getSandboxPath('trace.log'))
    let options = Memory.alloc(8)
    options.writeU64(1) // DEBUG 模式

    // threadId = 0: 跟踪当前线程（即调用 hook 的线程）
    gumtrace_init(moduleNames, outputPath, 0, options)
    gumtrace_run()
}

function stopTrace() {
    if (!isTracing) return
    isTracing = false
    gumtrace_unrun()
}

setImmediate(function() {
    if (!loadGumTrace()) return

    let targetModule = Process.findModuleByName(targetSo)
    console.log('target:', targetModule.name, 'base:', targetModule.base, 'size:', targetModule.size)

    // hook offset 0xD79A748 处的函数
    // onEnter 在调用线程上执行，threadId=0 会跟踪该线程
    Interceptor.attach(targetModule.base.add(0xD79A748), {
        onEnter(args) {
            if (!isTracing) {
                startTrace()
                this.didStart = true
            }
        },
        onLeave(retval) {
            if (this.didStart) {
                stopTrace()
            }
        }
    })

    console.log('hook installed at offset 0xD79A748, waiting for call...')
})
