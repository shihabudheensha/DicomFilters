using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace TigerView9.ImageProcessing.Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class DicomController : ControllerBase
    {
        private readonly IWebHostEnvironment _environment;

        public DicomController(IWebHostEnvironment environment)
        {
            _environment = environment;
        }

        [HttpGet("{fileName}")]
        public IActionResult GetDicom(string fileName)
        {
            var uploadsPath = Path.Combine(
                _environment.ContentRootPath,
                "Uploads");

            var filePath = Path.Combine(uploadsPath, fileName);

            if (!System.IO.File.Exists(filePath))
            {
                return NotFound();
            }

            return PhysicalFile(
                filePath,
                "application/dicom");
        }
    }
}
