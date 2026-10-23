require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-foldable'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = package['homepage']
  s.license      = package['license']
  s.author       = package['author']
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => package['repository'], :tag => s.version.to_s }
  s.source_files = 'ios/**/*.{h,mm}'

  install_modules_dependencies(s)
end
