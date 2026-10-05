export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="page">
      <div className="page-head">
        <h1>{title}</h1>
      </div>
      <div className="card empty">Bu bölüm bir sonraki aşamada eklenecek.</div>
    </div>
  )
}
