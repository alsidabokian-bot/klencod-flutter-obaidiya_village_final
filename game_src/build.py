# تجميع اللعبة في ملف HTML واحد:  python3 game_src/build.py [المسار]
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
order = ['config.js', 'math.js', 'meshes.js', 'world.js', 'terrain.js', 'interior.js', 'village.js', 'player.js', 'renderer.js', 'input.js', 'main.js']
js = '\n'.join(open(os.path.join(here, f), encoding='utf-8').read() for f in order)
t = open(os.path.join(here, 'template.html'), encoding='utf-8').read()
assert '/*JS*/' in t, 'marker missing'
t = t.replace('/*JS*/', js)
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'assets', 'game', 'index.html')
open(out, 'w', encoding='utf-8').write(t)
print('built', os.path.normpath(out), len(t), 'bytes')
