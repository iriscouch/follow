require 'json'

LIBRARY = [ "api.js", "feed.js", "lib.js", "cli.js" ]
BROWSER_TOOLS = Dir.glob("browser/*").select{|x| x != "browser/export.js" }

task :default => :export

desc 'Export Follow for use in web browsers'
task :export => ([:clean, "cli.js"] + LIBRARY + BROWSER_TOOLS) do |task|
  build = "./build"
  target = "#{build}/follow"

  sh "mkdir", "-p", target
  LIBRARY.each do |js|
    sh "node", "browser/export.js", js, "#{target}/#{js}"
  end

  BROWSER_TOOLS.each do |file|
    sh "cp", file, build
  end

  File.open("#{build}/boot.js", 'w') do |boot|
    requirejs_paths = { 'request' => '../request.jquery',
                        # 'foo' => 'bar', etc.
                      }

    opts = { # 'baseUrl' => "follow",
             'paths'   => requirejs_paths,
           }

    main_js = "follow/cli.js"

    boot.write([ 'require(',
                   '// Options',
                   opts.to_json() + ',',
                   '',
                   '// Modules',
                   [main_js].to_json() + ',',
                   '',
                   '// Code to run when ready',
                   'function(main) { return main(); }',
                 ');'
               ].join("\n"));
  end
end

desc 'Clean up build files'
task :clean do
  sh "rm", "-rf", "./build"
end
