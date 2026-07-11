import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, Edit2, Newspaper, Paperclip, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { getHomepagePosts, addHomepagePost, updateHomepagePost, deleteHomepagePost } from '@/services/homepage-post.service';
import type { HomepagePost, HomepagePostAttachment } from '@/types/homepage';
import type { User } from '@/types/models';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

const HOMEPAGE_MANAGER_ROLES = ['ship_manager', 'admin', 'system_admin'];
const CATEGORY_LABELS: Record<HomepagePost['category'], string> = { notice: '공지사항', news: '뉴스' };

export default function HomepagePostsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<HomepagePost[]>([]);
  const [loading, setLoading] = useState(true);

  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [form, setForm] = useState({
    category: 'notice' as HomepagePost['category'],
    title: '',
    content: '',
    is_published: true,
    published_at: new Date().toISOString().slice(0, 10),
    attachments: [] as HomepagePostAttachment[],
  });
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const permissions = usePermissions('homepage_posts');

  useEffect(() => {
    const init = async () => {
      const me = await getCurrentUser();
      if (!me || !HOMEPAGE_MANAGER_ROLES.includes(me.role)) { navigate('/dashboard'); return; }
      setCurrentUser(me);
      await loadData();
    };
    init();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      setPosts(await getHomepagePosts());
    } catch (e) {
      console.error(e);
      toast({ title: '게시글을 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openForm = (post?: HomepagePost) => {
    setForm({
      category: post?.category || 'notice',
      title: post?.title || '',
      content: post?.content || '',
      is_published: post?.is_published ?? true,
      published_at: post?.published_at || new Date().toISOString().slice(0, 10),
      attachments: post?.attachments || [],
    });
    setNewFiles([]);
    setError('');
    setFormView({ id: post?.id });
  };
  const closeForm = () => { setFormView(null); setError(''); setNewFiles([]); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter(f => {
      if (f.size > 10 * 1024 * 1024) { toast({ title: `${f.name}은 10MB를 초과합니다.`, variant: 'destructive' }); return false; }
      return true;
    });
    setNewFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };
  const removeNewFile = (idx: number) => setNewFiles(prev => prev.filter((_, i) => i !== idx));
  const removeExistingAttachment = (idx: number) => setForm(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }));
  const getAttachmentUrl = (path: string) => supabase.storage.from('documents').getPublicUrl(path).data.publicUrl;

  const handleSave = async () => {
    if (!currentUser) return;
    if (!form.title.trim()) { setError('제목을 입력해주세요.'); return; }
    if (!form.content.trim()) { setError('본문을 입력해주세요.'); return; }
    try {
      setSaving(true);
      const uploaded: HomepagePostAttachment[] = [];
      for (const file of newFiles) {
        const ext = file.name.split('.').pop();
        const path = `homepage-posts/${formView?.id || 'new'}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('documents').upload(path, file);
        if (uploadError) throw new Error(`${file.name} 업로드 실패`);
        uploaded.push({ name: file.name, path, size: file.size, type: file.type });
      }
      const attachments = [...form.attachments, ...uploaded];

      if (formView?.id) {
        await updateHomepagePost(formView.id, {
          category: form.category, title: form.title.trim(), content: form.content, attachments,
          is_published: form.is_published, published_at: form.published_at,
        });
      } else {
        await addHomepagePost({
          category: form.category, title: form.title.trim(), content: form.content, attachments,
          is_published: form.is_published, published_at: form.published_at, created_by: currentUser.id,
        });
      }
      await loadData();
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post: HomepagePost) => {
    if (!confirm('이 게시글을 삭제하시겠습니까?')) return;
    try {
      await deleteHomepagePost(post.id);
      await loadData();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const togglePublish = async (post: HomepagePost) => {
    try {
      await updateHomepagePost(post.id, { is_published: !post.is_published });
      await loadData();
    } catch (e) {
      toast({ title: '변경 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Newspaper className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">게시판 관리</h1>
          <p className="text-sm text-gray-500">홈페이지(inkmarine.co.kr)에 노출되는 공지사항/뉴스를 관리합니다. "게시" 상태인 글만 홈페이지에 표시됩니다.</p>
        </div>
      </div>

      {formView !== null && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{formView.id ? '게시글 수정' : '게시글 작성'}</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={closeForm} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '저장'}</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">분류</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v as HomepagePost['category'] })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notice">공지사항</SelectItem>
                    <SelectItem value="news">뉴스</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">게시일</Label>
                <Input type="date" value={form.published_at} onChange={e => setForm({ ...form, published_at: e.target.value })} className="h-9 text-sm" disabled={saving} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">제목 *</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="h-9 text-sm" disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">본문 *</Label>
              <Textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} rows={6} className="text-sm" disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">첨부파일</Label>
              {(form.attachments.length > 0 || newFiles.length > 0) && (
                <div className="space-y-1.5 mb-2">
                  {form.attachments.map((a, idx) => (
                    <div key={a.path} className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm">
                      <a href={getAttachmentUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline truncate">
                        <Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{a.name}</span>
                      </a>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 shrink-0" onClick={() => removeExistingAttachment(idx)} disabled={saving}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                  {newFiles.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-2 bg-blue-50 rounded-md text-sm">
                      <span className="flex items-center gap-2 text-blue-700 truncate">
                        <Paperclip className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{f.name}</span>
                        <span className="text-xs text-blue-400 shrink-0">(신규)</span>
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 shrink-0" onClick={() => removeNewFile(idx)} disabled={saving}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center justify-center gap-1.5 h-9 border border-dashed rounded-md text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
                <Upload className="w-3.5 h-3.5" />파일 추가 (최대 10MB)
                <input type="file" multiple className="hidden" onChange={handleFileChange} disabled={saving} />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_published} onCheckedChange={v => setForm({ ...form, is_published: v })} disabled={saving} />
              <Label className="text-xs">{form.is_published ? '게시 (홈페이지에 노출)' : '비공개 (임시저장)'}</Label>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs">전체 {posts.length}건</CardDescription>
            {formView === null && permissions.canCreate && (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />글쓰기</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {posts.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">등록된 게시글이 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-20">분류</TableHead>
                  <TableHead className="text-xs">제목</TableHead>
                  <TableHead className="text-xs w-28">게시일</TableHead>
                  <TableHead className="text-xs w-20">상태</TableHead>
                  <TableHead className="text-right text-xs w-20">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map(p => (
                  <TableRow key={p.id} className={`hover:bg-gray-50 ${permissions.canEdit ? 'cursor-pointer' : ''}`} onClick={() => permissions.canEdit && openForm(p)}>
                    <TableCell><Badge variant="outline" className="text-xs">{CATEGORY_LABELS[p.category]}</Badge></TableCell>
                    <TableCell className="font-medium text-sm">
                      {p.title}{p.attachments.length > 0 && <Paperclip className="inline w-3 h-3 ml-1 text-gray-400" />}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{p.published_at}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <button onClick={() => permissions.canEdit && togglePublish(p)} disabled={!permissions.canEdit}>
                        <Badge className={`text-xs ${p.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.is_published ? '게시중' : '비공개'}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {permissions.canEdit && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openForm(p)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        )}
                        {permissions.canDelete && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
