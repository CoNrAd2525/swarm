import shutil, os

src = r'c:\Users\Dell\Downloads\Nouveau dossier (3)\swarm-push-main'
dst = os.path.join(src, 'khwarizmian_swarm')
os.makedirs(dst, exist_ok=True)

files = [
    'base44_protocol.py', 'ethical_kernel.py', 'khwarizmian_plugins.py',
    'khwarizmian_swarm.py', 'khwarizmian_swarm_extended.py',
    'requirements.txt', 'run_swarm.py', 'swarm_agent.py',
    'README.md', 'LICENSE', 'repo_metadata.json'
]

for f in files:
    s = os.path.join(src, f)
    d = os.path.join(dst, f)
    if os.path.exists(s):
        shutil.copy2(s, d)
        print(f"Copied: {f} -> khwarizmian_swarm/")

os.makedirs(os.path.join(dst, '.github', 'workflows'), exist_ok=True)
ci = os.path.join(src, '.github', 'workflows', 'ci.yml')
ci_dst = os.path.join(dst, '.github', 'workflows', 'ci.yml')
if os.path.exists(ci):
    shutil.copy2(ci, ci_dst)
    print("Copied: .github/workflows/ci.yml -> khwarizmian_swarm/.github/workflows/")

for f in files + ['.github', '.github/workflows']:
    s = os.path.join(src, f)
    if os.path.isfile(s) and not f.startswith('.'):
        os.remove(s)
        print(f"Removed root: {f}")

for d in ['.github']:
    s = os.path.join(src, d)
    if os.path.isdir(s):
        try:
            shutil.rmtree(s)
            print(f"Removed root dir: {d}")
        except:
            pass

print("Done.")
