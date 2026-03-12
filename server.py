#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import http.server
import socketserver
import sqlite3
import json
import urllib.parse
import os
from datetime import datetime

PORT = 8080

# 初始化数据库
def init_db():
    conn = sqlite3.connect('quicknote.db')
    c = conn.cursor()
    # 创建笔记表
    c.execute('''
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        time_display TEXT NOT NULL
    )''')
    # 创建标签表
    c.execute('''
    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER,
        tag TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
    )''')
    conn.commit()
    conn.close()

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # 处理API请求
        if self.path.startswith('/api/'):
            self.handle_api_get()
        else:
            # 处理静态文件请求
            super().do_GET()
    
    def do_POST(self):
        # 处理API请求
        if self.path.startswith('/api/'):
            self.handle_api_post()
        else:
            super().do_POST()
    
    def do_PUT(self):
        # 处理API请求
        if self.path.startswith('/api/'):
            self.handle_api_put()
    
    def do_DELETE(self):
        # 处理API请求
        if self.path.startswith('/api/'):
            self.handle_api_delete()
    
    def handle_api_get(self):
        # 处理GET请求
        if self.path == '/api/notes':
            self.get_notes()
        elif self.path == '/api/tags':
            self.get_tags()
        else:
            self.send_error(404)
    
    def handle_api_post(self):
        # 处理POST请求
        if self.path == '/api/notes':
            self.add_note()
        else:
            self.send_error(404)
    
    def handle_api_put(self):
        # 处理PUT请求
        if self.path.startswith('/api/notes/'):
            note_id = self.path.split('/')[-1]
            self.update_note(note_id)
        else:
            self.send_error(404)
    
    def handle_api_delete(self):
        # 处理DELETE请求
        if self.path.startswith('/api/notes/'):
            note_id = self.path.split('/')[-1]
            self.delete_note(note_id)
        else:
            self.send_error(404)
    
    def get_notes(self):
        # 获取所有笔记
        conn = sqlite3.connect('quicknote.db')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        c.execute('SELECT * FROM notes ORDER BY timestamp DESC')
        notes = []
        for row in c.fetchall():
            note = {
                'id': row['id'],
                'content': row['content'],
                'timestamp': row['timestamp'],
                'timeDisplay': row['time_display'],
                'tags': []
            }
            # 获取笔记的标签
            c.execute('SELECT tag FROM tags WHERE note_id = ?', (row['id'],))
            for tag_row in c.fetchall():
                note['tags'].append(tag_row['tag'])
            notes.append(note)
        
        conn.close()
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(notes, ensure_ascii=False).encode('utf-8'))
    
    def get_tags(self):
        # 获取所有标签
        conn = sqlite3.connect('quicknote.db')
        c = conn.cursor()
        
        c.execute('SELECT DISTINCT tag FROM tags')
        tags = [row[0] for row in c.fetchall()]
        
        conn.close()
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(tags, ensure_ascii=False).encode('utf-8'))
    
    def add_note(self):
        # 添加新笔记
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))
        
        content = data.get('content', '')
        tags = data.get('tags', [])
        
        if not content:
            self.send_error(400, 'Content is required')
            return
        
        now = datetime.now()
        timestamp = now.isoformat()
        time_display = now.strftime('%Y-%m-%d %H:%M')
        
        conn = sqlite3.connect('quicknote.db')
        c = conn.cursor()
        
        try:
            # 插入笔记
            c.execute('INSERT INTO notes (content, timestamp, time_display) VALUES (?, ?, ?)', 
                      (content, timestamp, time_display))
            note_id = c.lastrowid
            
            # 插入标签
            for tag in tags:
                c.execute('INSERT INTO tags (note_id, tag) VALUES (?, ?)', (note_id, tag))
            
            conn.commit()
            
            # 返回新创建的笔记
            note = {
                'id': note_id,
                'content': content,
                'tags': tags,
                'timestamp': timestamp,
                'timeDisplay': time_display
            }
            
            self.send_response(201)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(note, ensure_ascii=False).encode('utf-8'))
        except Exception as e:
            conn.rollback()
            self.send_error(500, str(e))
        finally:
            conn.close()
    
    def update_note(self, note_id):
        # 更新笔记
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data.decode('utf-8'))
        
        content = data.get('content', '')
        tags = data.get('tags', [])
        
        if not content:
            self.send_error(400, 'Content is required')
            return
        
        now = datetime.now()
        timestamp = now.isoformat()
        time_display = now.strftime('%Y-%m-%d %H:%M')
        
        conn = sqlite3.connect('quicknote.db')
        c = conn.cursor()
        
        try:
            # 检查笔记是否存在
            c.execute('SELECT * FROM notes WHERE id = ?', (note_id,))
            if not c.fetchone():
                self.send_error(404, 'Note not found')
                return
            
            # 更新笔记
            c.execute('UPDATE notes SET content = ?, timestamp = ?, time_display = ? WHERE id = ?', 
                      (content, timestamp, time_display, note_id))
            
            # 删除旧标签
            c.execute('DELETE FROM tags WHERE note_id = ?', (note_id,))
            
            # 插入新标签
            for tag in tags:
                c.execute('INSERT INTO tags (note_id, tag) VALUES (?, ?)', (note_id, tag))
            
            conn.commit()
            
            # 返回更新后的笔记
            note = {
                'id': int(note_id),
                'content': content,
                'tags': tags,
                'timestamp': timestamp,
                'timeDisplay': time_display
            }
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(note).encode('utf-8'))
        except Exception as e:
            conn.rollback()
            self.send_error(500, str(e))
        finally:
            conn.close()
    
    def delete_note(self, note_id):
        # 删除笔记
        conn = sqlite3.connect('quicknote.db')
        c = conn.cursor()
        
        try:
            # 检查笔记是否存在
            c.execute('SELECT * FROM notes WHERE id = ?', (note_id,))
            if not c.fetchone():
                self.send_error(404, 'Note not found')
                return
            
            # 删除笔记（级联删除标签）
            c.execute('DELETE FROM notes WHERE id = ?', (note_id,))
            conn.commit()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'message': 'Note deleted successfully'}).encode('utf-8'))
        except Exception as e:
            conn.rollback()
            self.send_error(500, str(e))
        finally:
            conn.close()
    
    def end_headers(self):
        # 添加CORS头
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        # 处理OPTIONS请求
        self.send_response(200)
        self.end_headers()

if __name__ == '__main__':
    # 初始化数据库
    init_db()
    
    # 启动服务器
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"服务器运行在 http://localhost:{PORT}")
        print(f"访问地址: http://localhost:{PORT}/index.html")
        httpd.serve_forever()