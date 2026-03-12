#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import http.server
import socketserver
import sqlite3
import json
import urllib.parse
import os
from datetime import datetime
import time
import logging

# 配置日志
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

PORT = 8080

# 数据库连接管理类
class DatabaseManager:
    def __init__(self, db_path='quicknote.db'):
        self.db_path = db_path
        self.conn = None
        self.cur = None
        self._connect()
    
    def _connect(self):
        """建立数据库连接"""
        try:
            self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self.conn.row_factory = sqlite3.Row
            self.conn.execute('PRAGMA foreign_keys = ON')  # 启用外键约束
            self.cur = self.conn.cursor()
            logger.info(f"成功连接到数据库: {self.db_path}")
        except sqlite3.Error as e:
            logger.error(f"数据库连接失败: {e}")
            raise
    
    def connect(self):
        """获取数据库连接和游标"""
        if not self.conn:
            self._connect()
        return self.conn, self.cur
    
    def close(self):
        """关闭数据库连接"""
        if self.conn:
            try:
                self.conn.close()
                logger.info("数据库连接已关闭")
            except sqlite3.Error as e:
                logger.error(f"关闭数据库连接失败: {e}")
            finally:
                self.conn = None
                self.cur = None
    
    def commit(self):
        """提交事务"""
        if self.conn:
            try:
                self.conn.commit()
            except sqlite3.Error as e:
                logger.error(f"事务提交失败: {e}")
                raise
    
    def rollback(self):
        """回滚事务"""
        if self.conn:
            try:
                self.conn.rollback()
            except sqlite3.Error as e:
                logger.error(f"事务回滚失败: {e}")

# 全局数据库管理器实例
db_manager = DatabaseManager()

# 初始化数据库
def init_db():
    """初始化数据库表结构"""
    try:
        conn, c = db_manager.connect()
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
        # 创建索引以提高查询性能
        c.execute('CREATE INDEX IF NOT EXISTS idx_notes_timestamp ON notes (timestamp)')
        c.execute('CREATE INDEX IF NOT EXISTS idx_tags_note_id ON tags (note_id)')
        c.execute('CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags (tag)')
        db_manager.commit()
        logger.info("数据库初始化完成")
    except sqlite3.Error as e:
        logger.error(f"数据库初始化失败: {e}")
        db_manager.rollback()
        raise

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP请求处理器"""
    
    def do_GET(self):
        """处理GET请求"""
        if self.path.startswith('/api/'):
            self.handle_api_get()
        else:
            # 处理静态文件请求
            super().do_GET()
    
    def do_POST(self):
        """处理POST请求"""
        if self.path.startswith('/api/'):
            self.handle_api_post()
        else:
            super().do_POST()
    
    def do_PUT(self):
        """处理PUT请求"""
        if self.path.startswith('/api/'):
            self.handle_api_put()
        else:
            self.send_error(405, 'Method Not Allowed')
    
    def do_DELETE(self):
        """处理DELETE请求"""
        if self.path.startswith('/api/'):
            self.handle_api_delete()
        else:
            self.send_error(405, 'Method Not Allowed')
    
    def handle_api_get(self):
        """处理API的GET请求"""
        try:
            if self.path == '/api/notes':
                self.get_notes()
            elif self.path == '/api/tags':
                self.get_tags()
            else:
                self.send_error(404, 'API endpoint not found')
        except Exception as e:
            logger.error(f"Error in handle_api_get: {e}")
            self.send_error(500, 'Internal Server Error')
    
    def handle_api_post(self):
        """处理API的POST请求"""
        try:
            if self.path == '/api/notes':
                self.add_note()
            else:
                self.send_error(404, 'API endpoint not found')
        except Exception as e:
            logger.error(f"Error in handle_api_post: {e}")
            self.send_error(500, 'Internal Server Error')
    
    def handle_api_put(self):
        """处理API的PUT请求"""
        try:
            if self.path.startswith('/api/notes/'):
                note_id = self.path.split('/')[-1]
                if not note_id.isdigit():
                    self.send_error(400, 'Invalid note ID')
                    return
                self.update_note(note_id)
            else:
                self.send_error(404, 'API endpoint not found')
        except Exception as e:
            logger.error(f"Error in handle_api_put: {e}")
            self.send_error(500, 'Internal Server Error')
    
    def handle_api_delete(self):
        """处理API的DELETE请求"""
        try:
            if self.path.startswith('/api/notes/'):
                note_id = self.path.split('/')[-1]
                if not note_id.isdigit():
                    self.send_error(400, 'Invalid note ID')
                    return
                self.delete_note(note_id)
            else:
                self.send_error(404, 'API endpoint not found')
        except Exception as e:
            logger.error(f"Error in handle_api_delete: {e}")
            self.send_error(500, 'Internal Server Error')
    
    def get_notes(self):
        """获取所有笔记"""
        try:
            conn, c = db_manager.connect()
            
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
            
            self._send_json_response(200, notes)
        except Exception as e:
            logger.error(f"Error in get_notes: {e}")
            self.send_error(500, 'Internal Server Error')
    
    def get_tags(self):
        """获取所有标签"""
        try:
            conn, c = db_manager.connect()
            
            c.execute('SELECT DISTINCT tag FROM tags')
            tags = [row[0] for row in c.fetchall()]
            
            self._send_json_response(200, tags)
        except Exception as e:
            logger.error(f"Error in get_tags: {e}")
            self.send_error(500, 'Internal Server Error')
    
    def add_note(self):
        """添加新笔记"""
        try:
            if 'Content-Length' not in self.headers:
                self.send_error(400, 'Content-Length header is required')
                return
            
            content_length = int(self.headers['Content-Length'])
            if content_length > 10 * 1024 * 1024:  # 限制10MB
                self.send_error(413, 'Payload too large')
                return
            
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            content = data.get('content', '').strip()
            tags = data.get('tags', [])
            
            if not content:
                self.send_error(400, 'Content is required')
                return
            
            now = datetime.now()
            timestamp = now.isoformat()
            time_display = now.strftime('%Y-%m-%d %H:%M')
            
            conn, c = db_manager.connect()
            
            # 插入笔记
            c.execute('INSERT INTO notes (content, timestamp, time_display) VALUES (?, ?, ?)', 
                      (content, timestamp, time_display))
            note_id = c.lastrowid
            
            # 插入标签
            for tag in tags:
                if tag and isinstance(tag, str):
                    c.execute('INSERT INTO tags (note_id, tag) VALUES (?, ?)', (note_id, tag.strip()))
            
            db_manager.commit()
            logger.info(f"Note added: ID={note_id}")
            
            # 返回新创建的笔记
            note = {
                'id': note_id,
                'content': content,
                'tags': tags,
                'timestamp': timestamp,
                'timeDisplay': time_display
            }
            
            self._send_json_response(201, note)
        except json.JSONDecodeError:
            self.send_error(400, 'Invalid JSON format')
        except Exception as e:
            logger.error(f"Error in add_note: {e}")
            db_manager.rollback()
            self.send_error(500, 'Internal Server Error')
    
    def update_note(self, note_id):
        """更新笔记"""
        try:
            if 'Content-Length' not in self.headers:
                self.send_error(400, 'Content-Length header is required')
                return
            
            content_length = int(self.headers['Content-Length'])
            if content_length > 10 * 1024 * 1024:  # 限制10MB
                self.send_error(413, 'Payload too large')
                return
            
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            content = data.get('content', '').strip()
            tags = data.get('tags', [])
            
            if not content:
                self.send_error(400, 'Content is required')
                return
            
            now = datetime.now()
            timestamp = now.isoformat()
            time_display = now.strftime('%Y-%m-%d %H:%M')
            
            conn, c = db_manager.connect()
            
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
                if tag and isinstance(tag, str):
                    c.execute('INSERT INTO tags (note_id, tag) VALUES (?, ?)', (note_id, tag.strip()))
            
            db_manager.commit()
            logger.info(f"Note updated: ID={note_id}")
            
            # 返回更新后的笔记
            note = {
                'id': int(note_id),
                'content': content,
                'tags': tags,
                'timestamp': timestamp,
                'timeDisplay': time_display
            }
            
            self._send_json_response(200, note)
        except json.JSONDecodeError:
            self.send_error(400, 'Invalid JSON format')
        except Exception as e:
            logger.error(f"Error in update_note: {e}")
            db_manager.rollback()
            self.send_error(500, 'Internal Server Error')
    
    def delete_note(self, note_id):
        """删除笔记"""
        try:
            conn, c = db_manager.connect()
            
            # 检查笔记是否存在
            c.execute('SELECT * FROM notes WHERE id = ?', (note_id,))
            if not c.fetchone():
                self.send_error(404, 'Note not found')
                return
            
            # 删除笔记（级联删除标签）
            c.execute('DELETE FROM notes WHERE id = ?', (note_id,))
            db_manager.commit()
            logger.info(f"Note deleted: ID={note_id}")
            
            self._send_json_response(200, {'message': 'Note deleted successfully'})
        except Exception as e:
            logger.error(f"Error in delete_note: {e}")
            db_manager.rollback()
            self.send_error(500, 'Internal Server Error')
    
    def _send_json_response(self, status_code, data):
        """发送JSON响应"""
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json; charset=utf-8')
        self.end_headers()
        response = json.dumps(data, ensure_ascii=False)
        self.wfile.write(response.encode('utf-8'))
    
    def end_headers(self):
        """添加CORS头"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')  # 24小时
        super().end_headers()
    
    def do_OPTIONS(self):
        """处理OPTIONS请求"""
        self.send_response(200)
        self.end_headers()

if __name__ == '__main__':
    # 初始化数据库
    init_db()
    
    # 启动服务器
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"服务器运行在 http://localhost:{PORT}")
        print(f"访问地址: http://localhost:{PORT}/index.html")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n服务器已停止")
        finally:
            # 关闭数据库连接
            db_manager.close()