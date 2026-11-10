"""Build only browser runtime assets; keep collection files out of Pages."""
import json
import shutil
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
DATA = ('sample-bills.json', 'assembly-21.json', 'assembly-22.json', 'assembly-index.json')
MODULES = ('entry', 'zip', 'excel', 'model', 'template-1', 'template-2', 'docx', 'ui')


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        value = values.get('src') if tag in ('script', 'img') else values.get('href') if tag == 'link' else None
        if value:
            url = urlsplit(value)
            if not url.scheme and not url.netloc and url.path and not url.path.startswith('/'):
                self.paths.append(unquote(url.path))


def build(root=ROOT):
    root = root.resolve()
    dest = root / '_site'
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir()
    required = ['index.html', *DATA]
    html = (root / 'index.html').read_text(encoding='utf-8-sig')
    refs = References()
    refs.feed(html)
    required += refs.paths
    if 'monthly-report-entry.js' in html:
        required += [f'monthly-report-{name}.js' for name in MODULES]
    for name in set(required):
        path = (root / name).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError(f'필수 공개 파일 누락 또는 잘못된 경로: {name}')
    for name in DATA:
        with (root / name).open(encoding='utf-8-sig') as handle:
            json.load(handle)
    names = {'index.html', *DATA}
    names.update(path.name for path in root.glob('*.js'))
    names.update(path.name for path in root.glob('*.css'))
    names.update(refs.paths)
    for name in sorted(names):
        source = root / name
        if source.is_symlink():
            raise ValueError(f'심볼릭 링크는 배포하지 않습니다: {name}')
        target = dest / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    for name in ('assets', 'images'):
        folder = root / name
        if folder.is_dir():
            for path in folder.rglob('*'):
                if path.is_symlink():
                    raise ValueError(f'심볼릭 링크는 배포하지 않습니다: {path.relative_to(root)}')
            shutil.copytree(folder, dest / name, dirs_exist_ok=True)
    (dest / '.nojekyll').touch()
    files = [path for path in dest.rglob('*') if path.is_file()]
    size = sum(path.stat().st_size for path in files)
    if size >= 1024 ** 3:
        raise ValueError('배포 자료가 1GiB 이상입니다. 공개 파일 구성을 확인하세요.')
    summary = f'공개 파일 {len(files)}개 / {size:,}바이트 ({size / 1024 ** 2:.2f} MiB)\n'
    (root / '_site-size.txt').write_text(summary, encoding='utf-8')
    print(summary, end='')
    return dest


if __name__ == '__main__':
    build()
