// AlbumShelf 内置 ncm-cli 配置向导启动器
//
// 背景：AlbumShelf.exe 是 GUI 子系统程序，从 cmd 双击启动时不继承控制台，
// stdin 不是 TTY，ncm-cli 的交互式 configure 向导会拒绝运行（"需要交互式终端"）。
// 本启动器是控制台子系统程序，负责：
//   1. 附加父进程控制台（若无则新建），保证子进程 stdin/stdout 是真实控制台
//   2. 将控制台切换为 UTF-8 代码页（65001），保证向导的中文输出不乱码
//   3. 以 ELECTRON_RUN_AS_NODE=1 启动 AlbumShelf.exe 执行内置 ncm-cli，透传参数
//
// 编译（Windows 自带 .NET Framework 编译器）：
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:exe /out:build\ncm-configure.exe build\ncm-configure-launcher.cs
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class NcmConfigureLauncher
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AllocConsole();

    private const int ATTACH_PARENT_PROCESS = -1;

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            // 优先附加父进程控制台（cmd 窗口），失败则新建（双击 exe 的场景）
            if (!AttachConsole(ATTACH_PARENT_PROCESS))
            {
                AllocConsole();
            }
            Console.OutputEncoding = Encoding.UTF8;
            Console.InputEncoding = Encoding.UTF8;

            // 本 exe 位于 resources\，应用与内置 CLI 的固定相对位置
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string appExe = Path.GetFullPath(Path.Combine(baseDir, "..", "AlbumShelf.exe"));
            string cliEntry = Path.GetFullPath(Path.Combine(
                baseDir, "app.asar.unpacked", "node_modules",
                "@music163", "ncm-cli", "dist", "index.js"));

            string quotedArgs = "\"" + cliEntry + "\"";
            foreach (string arg in args)
            {
                quotedArgs += " \"" + arg.Replace("\"", "\\\"") + "\"";
            }

            var psi = new ProcessStartInfo
            {
                FileName = appExe,
                Arguments = quotedArgs,
                UseShellExecute = false // 子进程继承本进程（已挂接控制台）的标准句柄
            };
            psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";

            using (Process child = Process.Start(psi))
            {
                child.WaitForExit();
                return child.ExitCode;
            }
        }
        catch (Exception ex)
        {
            try
            {
                Console.Error.WriteLine("ncm-configure 启动失败: " + ex.Message);
            }
            catch
            {
                // 控制台都不可用时静默失败，错误码提示
            }
            return 1;
        }
    }
}
